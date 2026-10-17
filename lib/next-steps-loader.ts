/**
 * Self-contained SERVER loader for a Trip's "Next steps", for a caller that
 * hasn't already fetched a trip's stops/transports/etc for some other reason
 * (unlike the trip Home — see components/trip/home/phase-planning.tsx, which
 * has, and calls the pure `buildTripNextSteps` from lib/next-steps-builder.ts
 * directly with data it already loaded). Used by the trips list's featured
 * card.
 *
 * Reads its own Trip row for the phase gate and chapter/checklist counts,
 * and `lib/flags-loader.ts`'s `loadFlagRows` for the Stop/Transport/
 * Accommodation/Item collections and the Home/driving fields — the one place
 * every `detectFlags` caller's input is assembled (TB-01, spec 2026-10-14),
 * so this loader can never drift from the Summary page's own Flags list.
 * Then calls `buildTripNextSteps` — the ONE place the Flags+nudges→steps
 * logic lives, so this loader and the trip Home can never drift apart.
 * Returns `[]` for a date-less trip, or one not in the "planning"/
 * "final-prep" phase, exactly like the trip Home (which only renders a Next
 * steps card in those phases) — checked before `loadFlagRows` runs, so an
 * out-of-phase trip never reads its plan.
 *
 * Surprise (ADR 0051): `viewerId` is the Traveller reading the card;
 * `loadFlagRows` asks the visibility loader and threads its fragments into
 * the Item and Accommodation reads, as on the trip Home, so nothing inside a
 * Surprise hidden from them is read.
 */
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { REAL_PLAN } from "@/lib/plan-scope";
import { orderPlanStops } from "@/lib/plan-order";
import { computeTripPhase } from "@/lib/trip-phase";
import type { FlagStop } from "@/lib/flags";
import type { NextStep } from "@/lib/next-steps";
import { tripHomeBase } from "@/lib/home-base";
import { computeProjection } from "@/lib/trip-projection";
import { buildTripNextSteps } from "@/lib/next-steps-builder";
import { loadFlagRows } from "@/lib/flags-loader";

/**
 * Load a Trip's Next steps from scratch. `[]` when the trip has no dates yet,
 * or isn't in the "planning"/"final-prep" phase — the trip Home only shows a
 * Next steps card in those phases, so there's nothing to report otherwise.
 */
export async function loadNextSteps(tripId: string, today: string, viewerId: string): Promise<NextStep[]> {
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { startDate: true, endDate: true, hardEndDate: true, roundTrip: true, chaptersEnabled: true },
  });
  if (!trip?.startDate) return [];

  const phase = computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today });
  if (phase !== "planning" && phase !== "final-prep") return [];

  const startDate = trip.startDate;
  const endDate = trip.endDate ?? startDate;

  const [rows, undatedChapterCount, packingCount, pretripCount, slug] = await Promise.all([
    loadFlagRows(tripId, viewerId),
    trip.chaptersEnabled
      ? db.chapter.count({ where: { tripId, ...REAL_PLAN, startDate: null } })
      : Promise.resolve(0),
    db.checklistItem.count({ where: { tripId, kind: "PACKING" } }),
    db.checklistItem.count({ where: { tripId, kind: "PRETRIP" } }),
    tripSlugFor(tripId),
  ]);
  // Defensive only: the phase gate above already established the trip has
  // dates, so loadFlagRows (same check) will not actually return null here.
  if (!rows) return [];

  const tripBasePath = tripPath(slug);
  const roughStopCount = rows.allStops.filter((s) => s.arriveDate === null).length;
  const allStops = rows.allStops.map((s) => ({ id: s.id, name: s.name }));
  // computeProjection needs nights/pinned on every stop; loadFlagRows' own
  // select (FLAG_STOP_SELECT) always reads them — this just satisfies
  // RawAllStopRow's looser (optional) type for the other callers that don't.
  const projectionStops = rows.allStops.map((s) => ({ ...s, nights: s.nights ?? null, pinned: s.pinned ?? false }));
  const projection = computeProjection({ trip, stops: projectionStops, transports: rows.transports });

  const datedStops = orderPlanStops(
    rows.allStops
      .filter((s) => s.arriveDate !== null)
      .map((s) => ({
        id: s.id, name: s.name, lat: s.lat, lng: s.lng, timezone: s.timezone,
        arriveDate: s.arriveDate!, departDate: s.departDate!, sortOrder: s.sortOrder,
      })),
  );
  const flagStops: FlagStop[] = datedStops.map((s) => ({ ...s, timezone: s.timezone ?? "UTC" }));

  return buildTripNextSteps({
    tripBasePath,
    phase,
    tripStart: startDate,
    tripEnd: endDate,
    // Trip.roundTrip is non-null in the schema (default true); the Flag
    // assembler's type is nullable, so fall back to that same default here.
    roundTrip: rows.trip.roundTrip ?? true,
    home: tripHomeBase(rows.trip),
    homeTimezone: rows.trip.homeTimezone,
    datedStops: flagStops,
    roughStopCount,
    allStops,
    transports: rows.transports,
    accommodations: rows.accommodations,
    items: rows.items,
    projectedEnd: projection.projectedEnd,
    hardEndDate: projection.hardEndDate,
    deadline: projection.deadline,
    drivingWindingFactor: rows.trip.drivingWindingFactor,
    drivingAvgSpeedKph: rows.trip.drivingAvgSpeedKph,
    undatedChapterCount,
    hasPackingList: packingCount > 0,
    hasPretripList: pretripCount > 0,
    hiddenStopIds: rows.hiddenStopIds,
    hiddenItemIds: rows.hiddenItemIds,
    // The caller's today, the same one the phase gate above used.
    today,
  });
}
