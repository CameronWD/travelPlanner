import "server-only";
import { db } from "@/lib/db";
import { TRAVELLER_SELECT, travellerName } from "@/lib/traveller";
import type { UsageAction, UsageDetail, UsageScreen } from "./lists";
import { isValidTimeZone } from "./report-text";
import { readUsageRecording } from "./switch";

const MAIN_SITE = "main";
const FORMER_TRAVELLER = "A former Traveller";

export type UsageDayFigures = {
  day: string;
  screens: Partial<Record<UsageScreen, number>>;
  actions: { action: UsageAction; detail: UsageDetail | null; count: number }[];
  screenCount: number;
  actionCount: number;
  medianMs: number | null;
  savedCopies: number;
};

export type UsageTripReport = {
  travellers: { userId: string; name: string; days: UsageDayFigures[] }[];
  fromOtherSites: number;
  ai: { microUsd: number; runs: number; unpriced: number };
  google: { from: string; to: string; calls: { sku: string; count: number }[] } | null;
};

export type UsageOverview = {
  recording: boolean;
  total: number;
  fromOtherSites: number;
  lastReceivedAt: Date | null;
};

type FigureRow = {
  userId: string;
  day: string;
  screen: UsageScreen | null;
  action: UsageAction | null;
  detail: UsageDetail | null;
  count: number;
  saved: number;
};

type MedianRow = { userId: string; day: string; median: number };

export async function readUsageOverview(): Promise<UsageOverview> {
  const [recording, bySite, last] = await Promise.all([
    readUsageRecording(),
    db.usageRecord.groupBy({ by: ["site"], _count: { _all: true } }),
    db.usageRecord.findFirst({
      where: { site: MAIN_SITE },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    }),
  ]);
  let total = 0;
  let fromOtherSites = 0;
  for (const row of bySite) {
    if (row.site === MAIN_SITE) total += row._count._all;
    else fromOtherSites += row._count._all;
  }
  return { recording, total, fromOtherSites, lastReceivedAt: last?.receivedAt ?? null };
}

export async function readUsageTripReport(tripId: string, timeZone: string): Promise<UsageTripReport> {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";

  const [figures, medians, members, otherSites, trip, aiSum, aiUnpriced] = await Promise.all([
    db.$queryRaw<FigureRow[]>`
      SELECT "userId",
             to_char(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS "day",
             "screen", "action", "detail",
             count(*)::int AS "count",
             sum(CASE WHEN "savedCopy" THEN 1 ELSE 0 END)::int AS "saved"
      FROM "UsageRecord"
      WHERE "tripId" = ${tripId} AND "site" = ${MAIN_SITE}
      GROUP BY 1, 2, 3, 4, 5
    `,
    db.$queryRaw<MedianRow[]>`
      SELECT "userId",
             to_char(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS "day",
             round(percentile_cont(0.5) WITHIN GROUP (ORDER BY "appearMs"))::int AS "median"
      FROM "UsageRecord"
      WHERE "tripId" = ${tripId} AND "site" = ${MAIN_SITE}
        AND "screen" IS NOT NULL AND "appearMs" IS NOT NULL
      GROUP BY 1, 2
    `,
    db.tripMember.findMany({ where: { tripId }, select: { user: { select: { ...TRAVELLER_SELECT, email: true } } } }),
    db.usageRecord.count({ where: { tripId, site: { not: MAIN_SITE } } }),
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true, endDate: true } }),
    db.aiUsage.aggregate({
      where: { tripId },
      _sum: { estimatedCostMicroUsd: true },
      _count: { _all: true },
    }),
    db.aiUsage.count({ where: { tripId, estimatedCostMicroUsd: null } }),
  ]);

  const names = new Map(members.map((m) => [m.user.id, travellerName(m.user)]));
  const medianByDay = new Map(medians.map((m) => [`${m.userId}|${m.day}`, m.median]));

  const byUser = new Map<string, Map<string, UsageDayFigures>>();
  for (const row of figures) {
    let days = byUser.get(row.userId);
    if (!days) byUser.set(row.userId, (days = new Map()));
    let day = days.get(row.day);
    if (!day) {
      day = {
        day: row.day,
        screens: {},
        actions: [],
        screenCount: 0,
        actionCount: 0,
        medianMs: medianByDay.get(`${row.userId}|${row.day}`) ?? null,
        savedCopies: 0,
      };
      days.set(row.day, day);
    }
    if (row.screen) {
      day.screens[row.screen] = (day.screens[row.screen] ?? 0) + row.count;
      day.screenCount += row.count;
      day.savedCopies += row.saved;
    } else if (row.action) {
      day.actions.push({ action: row.action, detail: row.detail, count: row.count });
      day.actionCount += row.count;
    }
  }

  const travellers = [...byUser.entries()]
    .map(([userId, days]) => ({
      userId,
      name: names.get(userId) ?? FORMER_TRAVELLER,
      days: [...days.values()].sort((a, b) => b.day.localeCompare(a.day)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  let google: UsageTripReport["google"] = null;
  if (trip?.startDate && trip.endDate) {
    const rows = await db.googleUsage.groupBy({
      by: ["sku"],
      where: { day: { gte: trip.startDate, lte: trip.endDate } },
      _sum: { count: true },
    });
    google = {
      from: trip.startDate,
      to: trip.endDate,
      calls: rows
        .map((r) => ({ sku: r.sku, count: r._sum.count ?? 0 }))
        .sort((a, b) => b.count - a.count || a.sku.localeCompare(b.sku)),
    };
  }

  return {
    travellers,
    fromOtherSites: otherSites,
    ai: { microUsd: aiSum._sum.estimatedCostMicroUsd ?? 0, runs: aiSum._count._all, unpriced: aiUnpriced },
    google,
  };
}
