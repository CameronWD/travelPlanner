"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { type ActionResult, formFail, ok } from "@/lib/action-result";
import { revalidateAdmin } from "@/lib/revalidate";
import { readUsageOverview, readUsageTripReport, type UsageTripReport } from "@/lib/usage/report";
import { primeUsageRecording } from "@/lib/usage/switch";

export interface UsageOverviewView {
  recording: boolean;
  total: number;
  fromOtherSites: number;
  lastReceivedAt: string | null;
  trips: { id: string; name: string }[];
}

export async function listUsageOverview(): Promise<UsageOverviewView> {
  const admin = await requireAdmin();

  const [overview, memberships] = await Promise.all([
    readUsageOverview(),
    db.tripMember.findMany({
      where: { userId: admin.id, trip: { deletedAt: null } },
      select: { trip: { select: { id: true, name: true } } },
    }),
  ]);

  return {
    recording: overview.recording,
    total: overview.total,
    fromOtherSites: overview.fromOtherSites,
    lastReceivedAt: overview.lastReceivedAt ? overview.lastReceivedAt.toISOString() : null,
    trips: memberships.map((m) => m.trip).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function setUsageRecording(on: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (typeof on !== "boolean") return formFail("Couldn’t change that.");

  await db.usageSwitch.upsert({
    where: { id: "usage" },
    create: { id: "usage", recording: on, updatedById: admin.id },
    update: { recording: on, updatedById: admin.id },
  });
  primeUsageRecording(on);

  revalidateAdmin();
  return ok();
}

export async function readUsageTrip(tripId: string, timeZone: string): Promise<UsageTripReport | null> {
  const admin = await requireAdmin();
  if (typeof tripId !== "string" || typeof timeZone !== "string") return null;

  const membership = await db.tripMember.findFirst({
    where: { tripId, userId: admin.id, trip: { deletedAt: null } },
    select: { id: true },
  });
  if (!membership) return null;

  return readUsageTripReport(tripId, timeZone);
}
