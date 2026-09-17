/**
 * Digest dispatch — the server half of the daily Digest (CONTEXT.md **Digest**,
 * ADR 0047).
 *
 * `collectDigestInput` turns a (trip, local date, slot) into the plain data the
 * pure builder in `lib/digest.ts` needs; `dispatchDigest` turns a (user, trip,
 * local date, slot) into *at most one* push.
 *
 * Two properties matter more than anything else here:
 *
 * 1. **Claim before send.** Two cron runs can overlap. The `DigestDispatch`
 *    ledger row is created FIRST and a unique-constraint violation is read as
 *    "someone else already owns this slot" — so a re-run can never double-send.
 * 2. **Release on empty.** When the digest turns out to be `null` the claimed
 *    row is deleted again, so a quiet morning does not burn the slot: a plan
 *    edit later the same day can still produce a Digest.
 *
 * Everything time-sensitive arrives as a parameter (`localDate`, `slot`). This
 * module never reads the machine's clock or timezone.
 */
import { db } from "@/lib/db";
import {
  buildDigest,
  type DigestChecklistLine,
  type DigestInput,
  type DigestItemLine,
  type DigestPaymentLine,
  type DigestReminderLine,
  type DigestSlot,
  type DigestStayLine,
  type DigestTransportLine,
} from "@/lib/digest";
import { buildNotificationPayload, sendPush } from "@/lib/push";
import { computeTripPhase } from "@/lib/trip-phase";
import { buildCostLabelMap, costLabel } from "@/lib/cost-labels";
import { formatMoney } from "@/lib/money";
import { addDays, daysBetween } from "@/lib/dates";
import { instantToZonedDateISO, instantToZonedTime } from "@/lib/tz";

/** Days before a due date that a payment or checklist line starts appearing. */
export const DIGEST_LOOKAHEAD_DAYS = 3;

/** Prisma's unique-constraint violation — our "someone else claimed this slot". */
function isUniqueViolation(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

// ---------------------------------------------------------------------------
// collectDigestInput
// ---------------------------------------------------------------------------

/**
 * Gather everything that is true for one Trip on one local date.
 *
 * Only `forkId: null` rows are read: a Fork is a what-if variant Plan and must
 * never drive reminders (CONTEXT.md **Fork**).
 */
export async function collectDigestInput(opts: {
  tripId: string;
  localDate: string;
  slot: DigestSlot;
}): Promise<DigestInput> {
  const { tripId, localDate, slot } = opts;
  const windowEnd = addDays(localDate, DIGEST_LOOKAHEAD_DAYS);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { id: true, startDate: true, endDate: true, homeName: true },
  });

  const phase = computeTripPhase({
    startDate: trip?.startDate ?? null,
    endDate: trip?.endDate ?? null,
    today: localDate,
  });
  const travelling = phase === "travelling";

  const [dueCosts, checklistRows, reminderRows] = await Promise.all([
    db.cost.findMany({
      where: {
        tripId,
        forkId: null,
        paidAt: null,
        dueDate: { gte: localDate, lte: windowEnd },
      },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        dueDate: true,
        costMinor: true,
        currency: true,
        label: true,
        ownerType: true,
        ownerId: true,
      },
    }),
    db.checklistItem.findMany({
      where: { tripId, done: false, dueDate: { gte: localDate, lte: windowEnd } },
      orderBy: { dueDate: "asc" },
      select: { id: true, text: true, dueDate: true },
    }),
    db.reminder.findMany({
      where: { tripId, date: localDate },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  const ownedCosts = dueCosts.filter((c) => c.ownerType !== "OTHER");
  const needStops = ownedCosts.length > 0 || travelling;
  const needTransports = ownedCosts.length > 0 || travelling;

  // One stop lookup serves both jobs: naming a transport cost's endpoints and
  // reading a departure's wall clock.
  const stops = needStops
    ? await db.stop.findMany({
        where: { tripId, forkId: null },
        select: { id: true, name: true, timezone: true },
      })
    : [];
  const stopById = new Map(stops.map((s) => [s.id, s] as const));

  // Likewise one transport lookup, with the union of the fields both jobs need.
  const transportRows = needTransports
    ? await db.transport.findMany({
        where: { tripId, forkId: null },
        orderBy: { depAt: "asc" },
        select: {
          id: true,
          mode: true,
          depAt: true,
          depPlace: true,
          arrPlace: true,
          depIsHome: true,
          arrIsHome: true,
          reference: true,
          fromStopId: true,
          toStopId: true,
        },
      })
    : [];

  const payments = await buildPaymentLines({
    tripId,
    localDate,
    dueCosts,
    hasOwnedCosts: ownedCosts.length > 0,
    transportRows,
    stopById,
  });

  const checklist: DigestChecklistLine[] = checklistRows.map((row) => ({
    id: row.id,
    text: row.text,
    daysUntil: daysBetween(localDate, row.dueDate!),
  }));

  const reminders: DigestReminderLine[] = reminderRows.map((row) => ({
    id: row.id,
    title: row.title,
  }));

  const schedule = travelling
    ? await collectSchedule({
        tripId,
        // The EVENING Digest is tomorrow's look-ahead; the MORNING one is
        // travel-day insurance for today.
        targetDate: slot === "EVENING" ? addDays(localDate, 1) : localDate,
        homeName: trip?.homeName ?? null,
        transportRows,
        stopById,
      })
    : { transports: [], stays: [], items: [] };

  return { tripId, slot, phase, payments, checklist, reminders, schedule };
}

type TransportRow = {
  id: string;
  mode: string;
  depAt: Date | null;
  depPlace: string | null;
  arrPlace: string | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  reference: string | null;
  fromStopId: string | null;
  toStopId: string | null;
};

type StopRow = { id: string; name: string; timezone: string | null };

type DueCostRow = {
  id: string;
  dueDate: string | null;
  costMinor: number;
  currency: string;
  label: string | null;
  ownerType: string;
  ownerId: string | null;
};

/**
 * Name and price each upcoming payment.
 *
 * The owner-label map is built exactly as the budget page and both Home phases
 * build it (lib/cost-labels.ts): a stop-linked Transport has no free-text place
 * of its own, so its endpoints are resolved through the trip's stop names. Get
 * this wrong and the line reads "Cost · £240" instead of "Airbnb · £240".
 */
async function buildPaymentLines(args: {
  tripId: string;
  localDate: string;
  dueCosts: DueCostRow[];
  hasOwnedCosts: boolean;
  transportRows: TransportRow[];
  stopById: Map<string, StopRow>;
}): Promise<DigestPaymentLine[]> {
  const { tripId, localDate, dueCosts, hasOwnedCosts, transportRows, stopById } = args;
  if (dueCosts.length === 0) return [];

  let ownerNames = new Map<string, string>();
  if (hasOwnedCosts) {
    const [items, accommodations] = await Promise.all([
      db.item.findMany({
        where: { tripId, forkId: null },
        select: { id: true, title: true },
      }),
      db.accommodation.findMany({
        where: { tripId, forkId: null },
        select: { id: true, name: true },
      }),
    ]);

    ownerNames = buildCostLabelMap({
      items: items.map((i) => ({ id: i.id, title: i.title })),
      accommodations: accommodations.map((a) => ({ id: a.id, name: a.name })),
      transports: transportRows.map((t) => ({
        id: t.id,
        mode: t.mode,
        depPlace: t.fromStopId ? (stopById.get(t.fromStopId)?.name ?? null) : null,
        arrPlace: t.toStopId ? (stopById.get(t.toStopId)?.name ?? null) : null,
      })),
    });
  }

  return dueCosts.map((cost) => ({
    id: cost.id,
    label: costLabel(cost, ownerNames),
    amountLabel: formatMoney(cost.costMinor, cost.currency),
    daysUntil: daysBetween(localDate, cost.dueDate!),
  }));
}

/**
 * Tomorrow's (or today's) plan, for a Trip that is actually under way.
 *
 * Departures are matched in the **departure stop's** timezone, not UTC: a
 * 07:00 Tokyo train leaves on 2026-12-02 local even though its instant is
 * 2026-12-01 in UTC, and a Digest that dropped it would be silence nobody
 * notices.
 */
async function collectSchedule(args: {
  tripId: string;
  targetDate: string;
  homeName: string | null;
  transportRows: TransportRow[];
  stopById: Map<string, StopRow>;
}): Promise<DigestInput["schedule"]> {
  const { tripId, targetDate, homeName, transportRows, stopById } = args;

  const [stayRows, itemRows] = await Promise.all([
    db.accommodation.findMany({
      where: {
        tripId,
        forkId: null,
        OR: [{ checkIn: targetDate }, { checkOut: targetDate }],
      },
      orderBy: { checkIn: "asc" },
      select: {
        id: true,
        name: true,
        checkIn: true,
        checkOut: true,
        checkInTime: true,
        checkOutTime: true,
      },
    }),
    db.item.findMany({
      where: { tripId, forkId: null, date: targetDate },
      orderBy: [{ startTime: "asc" }, { sortOrder: "asc" }],
      select: { id: true, title: true, startTime: true },
    }),
  ]);

  const transports: DigestTransportLine[] = [];
  for (const t of transportRows) {
    if (!t.depAt) continue;
    const zone = transportZone(t, stopById);
    if (instantToZonedDateISO(t.depAt, zone) !== targetDate) continue;
    transports.push({
      id: t.id,
      mode: t.mode,
      route: transportRoute(t, stopById, homeName),
      localTime: instantToZonedTime(t.depAt, zone),
    });
  }

  // Check-out first thing on its day, check-in after — the same fixed reading
  // order the Timeline uses for untimed stays (CONTEXT.md **Accommodation**).
  const stays: DigestStayLine[] = [
    ...stayRows
      .filter((a) => a.checkOut === targetDate)
      .map((a) => ({
        id: a.id,
        name: a.name,
        kind: "CHECK_OUT" as const,
        localTime: a.checkOutTime ?? null,
      })),
    ...stayRows
      .filter((a) => a.checkIn === targetDate)
      .map((a) => ({
        id: a.id,
        name: a.name,
        kind: "CHECK_IN" as const,
        localTime: a.checkInTime ?? null,
      })),
  ];

  const items: DigestItemLine[] = itemRows.map((i) => ({
    id: i.id,
    title: i.title,
    localTime: i.startTime ?? null,
  }));

  return { transports, stays, items };
}

/** The zone a departure's wall clock should be read in. */
function transportZone(t: TransportRow, stopById: Map<string, StopRow>): string {
  const from = t.fromStopId ? stopById.get(t.fromStopId) : undefined;
  const to = t.toStopId ? stopById.get(t.toStopId) : undefined;
  return from?.timezone ?? to?.timezone ?? "UTC";
}

/**
 * "Vienna → Prague" for the digest line. Unlike the cost label this is a route
 * for a traveller to read, so a free-text endpoint (or the Home base) is used
 * when there is no linked Stop.
 */
function transportRoute(
  t: TransportRow,
  stopById: Map<string, StopRow>,
  homeName: string | null,
): string {
  const endpoint = (stopId: string | null, place: string | null, isHome: boolean) =>
    (stopId ? stopById.get(stopId)?.name : null) ?? place ?? (isHome ? homeName : null);

  const parts = [
    endpoint(t.fromStopId, t.depPlace, t.depIsHome),
    endpoint(t.toStopId, t.arrPlace, t.arrIsHome),
  ].filter((p): p is string => !!p);

  if (parts.length > 0) return parts.join(" → ");
  return t.reference ?? "departs";
}

// ---------------------------------------------------------------------------
// dispatchDigest
// ---------------------------------------------------------------------------

export interface DispatchDigestResult {
  sent: number;
  skipped: boolean;
  reason?: string;
}

/**
 * Send at most one Digest for a (user, trip, local date, slot).
 *
 * Order is load-bearing: preference → claim → build → send. `force` is for the
 * Settings "send me a test" button, which skips both the preference check and
 * the ledger so a test send never consumes the real slot.
 */
export async function dispatchDigest(opts: {
  userId: string;
  tripId: string;
  localDate: string;
  slot: DigestSlot;
  /** Test sends skip both the preference check and the ledger. */
  force?: boolean;
}): Promise<DispatchDigestResult> {
  const { userId, tripId, localDate, slot, force = false } = opts;

  if (!force) {
    const preference = await db.digestPreference.findUnique({
      where: { userId_tripId: { userId, tripId } },
      select: { enabled: true },
    });
    // A MISSING row means enabled: subscribing a device is itself the opt-in,
    // so an absent preference must never silently mute someone.
    if (preference && !preference.enabled) {
      return { sent: 0, skipped: true, reason: "disabled" };
    }
  }

  let claimed = false;
  if (!force) {
    try {
      await db.digestDispatch.create({
        data: { userId, tripId, localDate, slot },
        select: { id: true },
      });
      claimed = true;
    } catch (err) {
      if (isUniqueViolation(err)) {
        return { sent: 0, skipped: true, reason: "already-sent" };
      }
      throw err;
    }
  }

  const digest = buildDigest(await collectDigestInput({ tripId, localDate, slot }));

  if (!digest) {
    // Release the slot — otherwise a quiet evening burns it and a plan edit
    // later the same day could never produce a Digest.
    if (claimed) {
      await db.digestDispatch.delete({
        where: { userId_tripId_localDate_slot: { userId, tripId, localDate, slot } },
      });
    }
    return { sent: 0, skipped: true, reason: "empty" };
  }

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  const payload = buildNotificationPayload(digest);
  let sent = 0;
  const goneIds: string[] = [];

  for (const sub of subscriptions) {
    const result = await sendPush(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      payload,
    );
    if (result.sent) sent += 1;
    else if ("gone" in result && result.gone) goneIds.push(sub.id);
  }

  // Prune stale subscriptions — a 404/410 means the device is gone for good.
  if (goneIds.length > 0) {
    await db.pushSubscription.deleteMany({ where: { id: { in: goneIds } } });
  }

  return { sent, skipped: false };
}
