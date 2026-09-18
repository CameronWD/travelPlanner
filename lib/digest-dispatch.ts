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
  asTestDigest,
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
import { buildDigestPayload, sendPush } from "@/lib/push";
import { computeTripPhase } from "@/lib/trip-phase";
import { buildCostLabelMap, costLabel } from "@/lib/cost-labels";
import { formatMoney } from "@/lib/money";
import { addDays, daysBetween } from "@/lib/dates";
import {
  currentTripTimezone,
  guessTimezoneForCountry,
  instantToZonedDateISO,
  instantToZonedTime,
} from "@/lib/tz";

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
    select: {
      id: true,
      startDate: true,
      endDate: true,
      homeName: true,
      homeCountryCode: true,
    },
  });

  const phase = computeTripPhase({
    startDate: trip?.startDate ?? null,
    endDate: trip?.endDate ?? null,
    today: localDate,
  });

  // The EVENING Digest is tomorrow's look-ahead; the MORNING one is travel-day
  // insurance for today.
  const targetDate = slot === "EVENING" ? addDays(localDate, 1) : localDate;

  // The schedule is gated on the TARGET day falling inside the trip, not on
  // today's phase. On the eve of departure the phase is still "final-prep",
  // yet that is precisely the digest that should carry tomorrow's outbound
  // flight (ADR 0047). `endDate` falls back to `startDate` exactly as
  // computeTripPhase's soft end does.
  //
  // The window is one day WIDER than the trip at each end, because `startDate`
  // is the day the first Stop *arrives* (lib/firm-up.ts) and an overnight
  // long-haul outbound departs the day before it. A gate closed exactly on
  // startDate reproduces, one day earlier, the same hole ADR 0047's amendment
  // was written to close: no evening Digest names the outbound flight and the
  // travel-day morning Digest is empty. The gate costs little either way —
  // `collectSchedule` filters by the exact target date regardless; this is only
  // a cheap "don't even look" guard for trips that are nowhere near today.
  const tripStart = trip?.startDate ?? null;
  const tripEnd = trip?.endDate ?? tripStart;
  const targetIsInTrip =
    !!tripStart &&
    targetDate >= addDays(tripStart, -1) &&
    targetDate <= addDays(tripEnd!, 1);

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
    // No lower bound, deliberately. A Checklist item "persists until done" and
    // keeps reappearing while overdue (CONTEXT.md **Checklist**) — that is the
    // whole distinction from a Reminder, which is said once. A `gte: localDate`
    // here would give a Checklist item a Reminder's lifecycle: miss the day the
    // visa application was due and it drops out of the Digest silently. The
    // payment window above keeps BOTH bounds on purpose (CONTEXT.md **Due
    // date** scopes it to the three days before and the day itself).
    db.checklistItem.findMany({
      where: { tripId, done: false, dueDate: { lte: windowEnd } },
      orderBy: { dueDate: "asc" },
      select: { id: true, text: true, dueDate: true },
    }),
    // A Reminder is read out the EVENING BEFORE its date, alongside tomorrow's
    // plan (CONTEXT.md **Reminder**): one delivered at 9pm on the day it was
    // for arrives as that day is ending. `targetDate` is exactly that day for
    // the evening slot — and today for the morning slot, which never renders
    // reminders anyway (lib/digest.ts collectLines).
    db.reminder.findMany({
      where: { tripId, date: targetDate },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  const ownedCosts = dueCosts.filter((c) => c.ownerType !== "OTHER");
  const needStops = ownedCosts.length > 0 || targetIsInTrip;
  const needTransports = ownedCosts.length > 0 || targetIsInTrip;

  // One stop lookup serves both jobs: naming a transport cost's endpoints and
  // reading a departure's wall clock.
  const stops = needStops
    ? await db.stop.findMany({
        where: { tripId, forkId: null },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          timezone: true,
          arriveDate: true,
          departDate: true,
        },
      })
    : [];
  const stopById = new Map(stops.map((s) => [s.id, s] as const));

  // The Trip's own clock — what "the traveller's watch" reads on a leg that has
  // no departure Stop. See `transportZone` for why that is not the arrival
  // Stop's zone.
  const tripZone = resolveTripZone(trip?.homeCountryCode ?? null, stops);

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

  const schedule = targetIsInTrip
    ? await collectSchedule({
        tripId,
        targetDate,
        homeName: trip?.homeName ?? null,
        transportRows,
        stopById,
        tripZone,
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

type StopRow = {
  id: string;
  name: string;
  timezone: string | null;
  arriveDate: string | null;
  departDate: string | null;
};

/**
 * The Trip's own timezone — the one a traveller standing at their **Home base**
 * is living in.
 *
 * A Home base is not a Stop (CONTEXT.md **Home base**), so it carries no
 * `timezone` field of its own; the closest thing the Trip stores is
 * `homeCountryCode`. That is a country, not a city, so in a country spanning
 * several zones the guess can be an hour out (`au` resolves to Australia/Sydney,
 * which is AEDT while Brisbane stays AEST). It is still the right family of
 * answer: the calendar DATE and the ordering come out correct, which is what
 * the Digest files a departure under, and it is never the *destination's*
 * clock. When the country is unknown or unmapped, fall back to the zone of the
 * Stop the trip is currently at.
 */
function resolveTripZone(
  homeCountryCode: string | null,
  stops: StopRow[],
): string {
  const guessed = guessTimezoneForCountry(homeCountryCode);
  if (guessed !== "UTC") return guessed;
  return currentTripTimezone(stops);
}

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
 * Tomorrow's (or today's) plan, for a target day that falls inside the Trip.
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
  tripZone: string;
}): Promise<DigestInput["schedule"]> {
  const { tripId, targetDate, homeName, transportRows, stopById, tripZone } = args;

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
    const zone = transportZone(t, stopById, tripZone);
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

/**
 * The zone a departure's wall clock should be read in.
 *
 * A leg with NO departure Stop is the **outbound** leg from the Home base, and
 * a Home base is not a Stop (CONTEXT.md **Home base**) — so `fromStopId` is
 * always null there. Falling through to the arrival Stop's zone reads a
 * Brisbane 06:00 departure as 21:00 the previous evening in Vienna: the Digest
 * then both mistimes the flight and files it under the wrong day, while the
 * published `VALARM` — a relative offset from the true UTC instant — stays
 * right. The Digest exists to back the Alarm up, so it must not contradict it.
 */
function transportZone(
  t: TransportRow,
  stopById: Map<string, StopRow>,
  tripZone: string,
): string {
  if (!t.fromStopId) return tripZone;
  const from = stopById.get(t.fromStopId);
  if (from?.timezone) return from.timezone;
  // A departure Stop that is still rough has no zone of its own; the arrival
  // Stop is the nearer answer for a mid-trip leg, and the trip's own zone is
  // the last resort (never a bare "UTC", which is nobody's wall clock).
  const to = t.toStopId ? stopById.get(t.toStopId) : undefined;
  return to?.timezone ?? tripZone;
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

/** Why a dispatch produced no push. Tasks 7 and 8 branch on these strings. */
export type DispatchSkipReason = "disabled" | "already-sent" | "empty";

export interface DispatchDigestResult {
  sent: number;
  skipped: boolean;
  reason?: DispatchSkipReason;
  /**
   * Set only when a forced test send found nothing to say and delivered the
   * placeholder instead. Absent on every other path, so the scheduled result
   * shape is unchanged.
   */
  placeholder?: true;
}

/**
 * Send at most one Digest for a (user, trip, local date, slot).
 *
 * Order is load-bearing: preference → claim → build → send. `force` is for the
 * Settings "send me a test" button: it skips both the preference check and the
 * ledger so a test send never consumes the real slot, and it swaps the payload
 * through `asTestDigest` so the press always puts *something* on the device.
 */
export async function dispatchDigest(opts: {
  userId: string;
  tripId: string;
  localDate: string;
  slot: DigestSlot;
  /** The Settings test send: skips the preference check and the ledger, and marks the payload as a test. */
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

  /**
   * Hand the slot back. Only ever releases a row this call actually created,
   * so a `force: true` test send can never delete a real run's claim.
   */
  const releaseClaim = async () => {
    if (!claimed) return;
    await db.digestDispatch.delete({
      where: { userId_tripId_localDate_slot: { userId, tripId, localDate, slot } },
    });
    claimed = false;
  };

  try {
    const built = buildDigest(await collectDigestInput({ tripId, localDate, slot }));

    // A forced send is the Settings test button, and it must never refuse: an
    // empty day gets the placeholder, a day with content gets that content
    // marked as a test (lib/digest.ts asTestDigest).
    const digest = force ? asTestDigest(built, tripId) : built;
    const placeholder = force && !built;

    if (!digest) {
      // Release the slot — otherwise a quiet evening burns it and a plan edit
      // later the same day could never produce a Digest. Unreachable when
      // `force` is set, because asTestDigest never returns null.
      await releaseClaim();
      return { sent: 0, skipped: true, reason: "empty" };
    }

    const subscriptions = await db.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    const payload = buildDigestPayload(digest);
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

    // Nothing reached a device that had one. `sendPush` swallows every
    // non-404/410 error and returns `{ sent: false }` without throwing, so a
    // gateway 500 otherwise leaves this loop exiting *normally* with the ledger
    // row standing: the redundancy run inside the same window answers
    // "already-sent" and the day's Digest is lost with `failed: 0` in the cron
    // response and nothing in the logs. Hand the slot back instead. Sending
    // twice because a response was lost is strictly better than never sending.
    if (subscriptions.length > 0 && sent === 0) {
      console.error(
        force
          ? "[digest] no push was delivered for a forced test send — nothing was claimed, so there is no slot to release:"
          : "[digest] no push was delivered — releasing the claimed slot so the next run retries:",
        { userId, tripId, localDate, slot, subscriptions: subscriptions.length },
      );
      await releaseClaim();
    }

    return placeholder ? { sent, skipped: false, placeholder: true } : { sent, skipped: false };
  } catch (err) {
    // A claim must never outlive the work it was claiming. Without this, one
    // failed collect holds the slot until tomorrow: the person silently gets
    // no Digest and every retry answers "already-sent" — a loud failure turned
    // into a quiet one. The error is rethrown so the caller still counts and
    // logs it.
    try {
      await releaseClaim();
    } catch (releaseErr) {
      // Surfacing the original failure matters more than this one — but name
      // the row, or the operator reads "release failed" with no way to find the
      // stuck ledger entry that is now muting someone for the rest of the day.
      console.error(
        "[digest] failed to release a claimed dispatch row:",
        { userId, tripId, localDate, slot },
        releaseErr,
      );
    }
    throw err;
  }
}
