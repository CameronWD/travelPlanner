/**
 * The trip Home's ONE query path for its planning data — budget totals,
 * upcoming payments, Stops (dated + all) and the full ranked Next steps.
 *
 * Called by both Home trees on the same request: the phone Planning/Final-prep
 * Phase (components/trip/home/phase-planning.tsx) and the desktop (lg+) Home's
 * Trip cost / Route map / "Sort these out" tiles (app/(app)/trips/[tripId]/
 * page.tsx). Wrapped in React's `cache()` so the second call on a request is
 * free when both pass the same `trip` object (the page does).
 *
 * Deliberately NO auth import: every caller is a page that has already run
 * `requireTripAccess` (the projection is computed from the rows read here,
 * spec 2026-10-06 §C). Policy (not a BND-2 spelling exemption): Home is a
 * dated view and always reads the real plan, ignoring `?plan=` — never wire
 * a variable plan in here.
 *
 * Surprise (ADR 0051): `viewerId` is the Traveller reading Home. The
 * visibility loader runs before the wave and its fragments go into the Item
 * and Accommodation reads, so nothing inside a Surprise hidden from the
 * viewer leaves the database. Costs are read whole: money stays in the totals
 * (CONTEXT.md Surprise), and only the lines (upcoming payments) drop the
 * Costs owned by hidden Items and Accommodation. Their hidden real-plan Items
 * join as placeholders, so the slot still counts. Flags skip the hidden Stops. The planner's own Surprises
 * whose day has come become the reveal nudge (CONTEXT.md Surprise).
 */
import { cache } from "react";
import { db } from "@/lib/db";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { REAL_PLAN } from "@/lib/plan-scope";
import type { TripPhase } from "@/lib/trip-phase";
import type { FlagTransport, FlagAccommodation, FlagItem } from "@/lib/flags";
import {
  buildBudget,
  applyFxRatesToCosts,
  type BudgetResult,
  type BudgetStopWithDates,
  type BudgetItem,
  type BudgetAccommodation,
  type BudgetTransport,
} from "@/lib/money/budget";
import { buildTripNextSteps, surprisesToReveal } from "@/lib/next-steps-builder";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import { buildNextSteps, type NextStep } from "@/lib/next-steps";
import { tripHomeBase } from "@/lib/home-base";
import { computeProjection } from "@/lib/trip-projection";
import { orderPlanStops } from "@/lib/plan-order";
import { buildCostLabelMap } from "@/lib/money/cost-labels";
import { buildUpcomingPayments, type UpcomingPayment } from "@/lib/money/upcoming-payments";
import { buildStillToBook, type StillToBookRow } from "@/lib/still-to-book";
import { resolveEndpointZones } from "@/lib/time-display";
import { instantToZonedDateISO } from "@/lib/tz";

const COST_SELECT = {
  id: true,
  costMinor: true,
  paidMinor: true,
  currency: true,
  rateToHome: true,
  paidAt: true,
  dueDate: true,
  ownerType: true,
  ownerId: true,
  label: true,
  category: true,
  settlement: true,
} as const;

export interface HomeTripInput {
  id: string;
  startDate: string | null;
  endDate: string | null;
  /** For the projection's deadline (ADR 0068); omitted → none. */
  hardEndDate?: string | null;
  homeCurrency: string;
  drivingWindingFactor: number;
  drivingAvgSpeedKph: number;
  homeName: string | null;
  homeLat: number | null;
  homeLng: number | null;
  homeCountryCode: string | null;
  /** The Trip's Home base IANA timezone (spec 2026-10-14, TB-01). Required so a caller that forgets to select it fails to type-check rather than silently dropping it from the Flags. */
  homeTimezone: string | null;
  roundTrip: boolean;
  chaptersEnabled: boolean;
}

interface HomeDatedStop {
  id: string;
  name: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string | null;
  arriveDate: string;
  departDate: string;
  sortOrder: number;
}

interface HomePlanStop {
  id: string;
  name: string;
  sortOrder: number;
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
  arriveDate: string | null;
  departDate: string | null;
  nights: number | null;
}

interface HomeChapter {
  id: string;
  name: string;
  colour: string;
  startDate: string;
  endDate: string;
}

export interface HomePlanningData {
  /** Dated Stops, canonical plan order (ADR 0038). */
  datedStops: HomeDatedStop[];
  /** Every real-plan Stop (dated + rough), canonical plan order. */
  planStops: HomePlanStop[];
  datedChapters: HomeChapter[];
  /** Rough (date-less) Chapters — 0 when Chapters are off. */
  undatedChapterCount: number;
  budget: Pick<BudgetResult, "grandTotal">;
  /** Unpaid costs with a due date, soonest first. */
  upcomingPayments: UpcomingPayment[];
  /** Every Next step, ranked — callers cap it (the phone card shows 4). */
  steps: NextStep[];
  /** CONTEXT.md "Booking state": everything still To book, soonest book-by first (lib/still-to-book.ts). Real plan; nothing hidden by a Surprise. */
  stillToBook: StillToBookRow[];
}

async function load(
  tripId: string,
  today: string,
  phase: TripPhase,
  trip: HomeTripInput,
  viewerId: string,
): Promise<HomePlanningData> {
  const homeCurrency = trip.homeCurrency;
  const v = await loadSurpriseVisibility(tripId, viewerId);

  // One wave (spec 2026-10-06 §C): every real-plan Stop in ONE read — the
  // dated list, the rough count and plan order all come from it — and the
  // projection below reuses these rows instead of reading them again.
  const [
    allStopsRaw,
    transports,
    accommodations,
    itemRows,
    costs,
    exchangeRates,
    datedChaptersRaw,
    undatedChapterCount,
    packingCount,
    pretripCount,
    slug,
  ] = await Promise.all([
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, name: true, country: true, countryCode: true, lat: true, lng: true, timezone: true,
        arriveDate: true, departDate: true, sortOrder: true, nights: true, pinned: true,
      },
    }),
    db.transport.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        mode: true,
        fromStopId: true,
        toStopId: true,
        depAt: true,
        arrAt: true,
        depIsHome: true,
        arrIsHome: true,
        anchorStopId: true,
        bookingState: true,
        bookBy: true,
      },
    }),
    db.accommodation.findMany({
      where: { tripId, ...REAL_PLAN, ...v.where.accommodation },
      select: { id: true, stopId: true, name: true, checkIn: true, checkOut: true, bookingState: true, bookBy: true },
    }),
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, ...v.where.item },
      select: {
        id: true,
        title: true,
        stopId: true,
        category: true,
        date: true,
        startTime: true,
        endTime: true,
        lat: true,
        lng: true,
        bookingState: true,
        bookBy: true,
      },
    }),
    db.cost.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { createdAt: "asc" },
      select: COST_SELECT,
    }),
    db.exchangeRate.findMany({
      where: { tripId },
      select: { base: true, quote: true, rate: true },
    }),
    // A disabled trip renders as if it had no chapters (Task 13) — skip both
    // chapter queries entirely rather than fetch-then-discard.
    trip.chaptersEnabled
      ? db.chapter.findMany({
          where: { tripId, ...REAL_PLAN, startDate: { not: null } },
          orderBy: { startDate: "asc" },
          select: { id: true, name: true, colour: true, startDate: true, endDate: true },
        })
      : Promise.resolve([]),
    trip.chaptersEnabled
      ? db.chapter.count({ where: { tripId, ...REAL_PLAN, startDate: null } })
      : Promise.resolve(0),
    db.checklistItem.count({ where: { tripId, kind: "PACKING" } }),
    db.checklistItem.count({ where: { tripId, kind: "PRETRIP" } }),
    tripSlugFor(tripId),
  ]);
  const base = tripPath(slug);
  // A hidden real-plan Item still holds its slot: a placeholder titled
  // "Surprise", with its date and times only.
  const items = [
    ...itemRows,
    ...v.placeholderItems
      .filter((p) => p.forkId === null && p.date !== null)
      .map((p) => ({
        id: p.id, title: p.title, stopId: p.stopId, category: p.category, date: p.date,
        startTime: p.startTime, endTime: p.endTime, lat: p.lat, lng: p.lng,
      })),
  ];
  const roughStopCount = allStopsRaw.filter((s) => s.arriveDate === null).length;

  const costsWithRates = applyFxRatesToCosts({ costs, exchangeRates, homeCurrency });

  // ADR 0038: a scheduled stop's position IS its dates — re-sort canonically;
  // the fetch's orderBy stays sortOrder.
  const datedStops: HomeDatedStop[] = orderPlanStops(
    allStopsRaw
      .filter((s) => s.arriveDate !== null)
      .map((s) => ({
        id: s.id, name: s.name, country: s.country, lat: s.lat, lng: s.lng, timezone: s.timezone,
        arriveDate: s.arriveDate!, departDate: s.departDate!, sortOrder: s.sortOrder,
      })),
  );
  const planStops: HomePlanStop[] = orderPlanStops(
    allStopsRaw.map((s) => ({
      id: s.id, name: s.name, sortOrder: s.sortOrder, lat: s.lat, lng: s.lng, countryCode: s.countryCode,
      arriveDate: s.arriveDate, departDate: s.departDate, nights: s.nights,
    })),
  );
  const datedChapters: HomeChapter[] = datedChaptersRaw.map((c) => ({
    ...c,
    startDate: c.startDate!,
    endDate: c.endDate!,
  }));

  // A date-less (Sketching) trip has no day window; the grand total counts
  // every cost regardless of the window (lib/money/budget.ts), so today stands in.
  const startDate = trip.startDate ?? today;
  const endDate = trip.endDate ?? startDate;

  const budgetStops: BudgetStopWithDates[] = datedStops.map((s) => ({
    id: s.id,
    name: s.name,
    timezone: s.timezone,
    arriveDate: s.arriveDate,
    departDate: s.departDate,
    sortOrder: s.sortOrder,
  }));
  const budget = buildBudget({
    homeCurrency,
    costs: costsWithRates,
    stops: budgetStops,
    items: items as BudgetItem[],
    accommodations: accommodations as BudgetAccommodation[],
    transports: transports as BudgetTransport[],
    tripStart: startDate,
    tripEnd: endDate,
    chapters: datedChapters,
    surpriseOwnerIds: v.hiddenOwnerIds,
  });

  // Upcoming payments — same owner-label map as the budget page, resolved
  // against every stop (dated or rough) so transport costs still label.
  const stopNameById = new Map(allStopsRaw.map((s) => [s.id, s.name] as const));
  const ownerNames = buildCostLabelMap({
    items: items.map((i) => ({ id: i.id, title: i.title })),
    accommodations: accommodations.map((a) => ({ id: a.id, name: a.name })),
    transports: transports.map((t) => ({
      id: t.id,
      mode: t.mode,
      depPlace: t.fromStopId ? (stopNameById.get(t.fromStopId) ?? null) : null,
      arrPlace: t.toStopId ? (stopNameById.get(t.toStopId) ?? null) : null,
    })),
  });
  // Surprise: the lines leave out money inside a Surprise hidden from the viewer.
  const hiddenOwners = new Set(v.hiddenOwnerIds);
  const lineCosts = costs.filter((c) => !c.ownerId || !hiddenOwners.has(c.ownerId));
  const upcomingPayments = buildUpcomingPayments({ costs: lineCosts, ownerNames, today });

  // Still to book (spec 2026-10-17 R2): `itemRows`/`accommodations` already
  // carry the Surprise fragments; Wishlist ideas (no Stop, no date) are not in the plan.
  const tzById = new Map(allStopsRaw.map((s) => [s.id, s.timezone] as const));
  const stillToBook = buildStillToBook(
    [
      ...itemRows
        .filter((i) => i.bookingState === "TO_BOOK" && (i.stopId || i.date))
        .map((i) => ({ kind: "ITEM" as const, id: i.id, label: i.title, bookingState: "TO_BOOK" as const, bookBy: i.bookBy, date: i.date, stopId: i.stopId })),
      ...transports
        .filter((t) => t.bookingState === "TO_BOOK")
        .map((t) => {
          const { depTz } = resolveEndpointZones(
            t.fromStopId ? (tzById.get(t.fromStopId) ?? null) : null,
            t.toStopId ? (tzById.get(t.toStopId) ?? null) : null,
            { depIsHome: t.depIsHome, arrIsHome: t.arrIsHome, homeTimezone: trip.homeTimezone },
          );
          return {
            kind: "TRANSPORT" as const, id: t.id, label: ownerNames.get(t.id) ?? "Transport", bookingState: "TO_BOOK" as const, bookBy: t.bookBy,
            date: t.depAt ? instantToZonedDateISO(t.depAt, depTz) : null, stopId: t.anchorStopId ?? t.fromStopId ?? t.toStopId,
          };
        }),
      ...accommodations
        .filter((a) => a.bookingState === "TO_BOOK")
        .map((a) => ({ kind: "ACCOMMODATION" as const, id: a.id, label: a.name, bookingState: "TO_BOOK" as const, bookBy: a.bookBy, date: a.checkIn, stopId: a.stopId })),
    ],
    base,
  );

  let steps: NextStep[];
  if (trip.startDate) {
    const projection = computeProjection({
      trip: { startDate: trip.startDate, hardEndDate: trip.hardEndDate ?? null, roundTrip: trip.roundTrip },
      stops: allStopsRaw,
      transports,
    });
    steps = buildTripNextSteps({
      tripBasePath: base,
      phase,
      tripStart: startDate,
      tripEnd: endDate,
      roundTrip: trip.roundTrip,
      home: tripHomeBase(trip),
      homeTimezone: trip.homeTimezone,
      datedStops: datedStops.map((s) => ({ ...s, timezone: s.timezone ?? "UTC" })),
      roughStopCount,
      allStops: allStopsRaw, // sortOrder asc — first/last drive the flight nudges
      transports: transports as FlagTransport[],
      accommodations: accommodations as FlagAccommodation[],
      items: items as FlagItem[],
      projectedEnd: projection.projectedEnd,
      hardEndDate: projection.hardEndDate,
      deadline: projection.deadline,
      drivingWindingFactor: trip.drivingWindingFactor,
      drivingAvgSpeedKph: trip.drivingAvgSpeedKph,
      undatedChapterCount,
      hasPackingList: packingCount > 0,
      hasPretripList: pretripCount > 0,
      hiddenStopIds: v.hiddenStopIds,
      surprisesToReveal: surprisesToReveal({ views: v.views, viewerId, today, stops: allStopsRaw, items: itemRows }),
      limit: Number.POSITIVE_INFINITY,
    });
  } else {
    // Sketching: no dates, so no Flags (they need a day window) — only the
    // forward nudges, led by "Set your trip dates".
    steps = buildNextSteps({
      flags: [],
      phase,
      tripBasePath: base,
      limit: Number.POSITIVE_INFINITY,
      nudges: {
        hasDates: false,
        undatedChapterCount,
        hasPackingList: packingCount > 0,
        hasPretripList: pretripCount > 0,
        unbookedTransportCount: transports.filter((t) => !t.depAt).length,
        hasHomeBase: !!tripHomeBase(trip),
        hasOutboundLeg: true,
        hasReturnLeg: true,
        roundTrip: trip.roundTrip,
        homeName: trip.homeName,
        firstStopName: null,
        lastStopName: null,
      },
    });
  }
  return { datedStops, planStops, datedChapters, undatedChapterCount, budget, upcomingPayments, steps, stillToBook };
}

/** Per-request memoised: the phone and desktop Home trees share one load. */
export const loadHomePlanningData = cache(load);
