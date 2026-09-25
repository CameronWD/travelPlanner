import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { daysBetween } from "@/lib/dates";
import { describePhase, type TripPhase } from "@/lib/trip-phase";
import {
  detectFlags,
  type FlagStop,
  type FlagTransport,
  type FlagAccommodation,
  type FlagItem,
} from "@/lib/flags";
import {
  buildBudget,
  applyFxRatesToCosts,
  type BudgetStopWithDates,
  type BudgetItem,
  type BudgetAccommodation,
  type BudgetTransport,
} from "@/lib/budget";
import { buildNextSteps } from "@/lib/next-steps";
import { tripHomeBase, hasOutboundLeg, hasReturnLeg } from "@/lib/home-base";
import { getTripProjection } from "@/server/actions/stops";
import { chapterForStop } from "@/lib/chapters";
import { chapterColourSwatch } from "@/lib/chapter-colours";
import { Route } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { CountdownHero } from "@/components/trip/home/countdown-hero";
import { NextStepsCard } from "@/components/trip/home/next-steps-card";
import { BudgetGlance } from "@/components/trip/home/budget-glance";
import { QuickActions } from "@/components/trip/home/quick-actions";
import { RouteMapLoader as RouteMap } from "@/components/trip/route-map-loader";
import type { RouteMapStop } from "@/components/trip/route-map";
import { orderPlanStops } from "@/lib/plan-order";
import { buildCostLabelMap } from "@/lib/cost-labels";
import { buildUpcomingPayments } from "@/lib/upcoming-payments";
import { UpcomingPaymentsCard } from "@/components/trip/upcoming-payments-card";

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
} as const;

interface PhasePlanningProps {
  tripId: string;
  trip: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    homeCurrency: string;
    drivingWindingFactor: number;
    drivingAvgSpeedKph: number;
    homeName: string | null;
    homeLat: number | null;
    homeLng: number | null;
    homeCountryCode: string | null;
    roundTrip: boolean;
    chaptersEnabled: boolean;
  };
  today: string;
  phase: TripPhase; // "planning" | "final-prep"
  /** The trip Home's Reminders card, rendered by the page for every Phase —
   * this phase's job is only to place it at the end of the right rail. */
  reminders?: ReactNode;
}

/** Exported for className assertion in tests — must match the JSX below. */
export const PLANNING_DESKTOP_GRID_CLASS =
  "grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_21.25rem] lg:items-start";

export async function PhasePlanning({
  tripId,
  trip,
  today,
  phase,
  reminders,
}: PhasePlanningProps) {
  // This phase only renders for dated trips; bail safely if called otherwise.
  // Reminders still need a home even in this defensive branch, since the
  // page passes them in regardless of phase.
  if (!trip.startDate) return <>{reminders}</>;

  const base = `/trips/${tripId}`;
  const startDate = trip.startDate!;
  const endDate = trip.endDate ?? startDate;
  const homeCurrency = trip.homeCurrency;

  const [
    datedStopsRaw,
    roughStops,
    allStopsRaw,
    transports,
    accommodations,
    items,
    costs,
    exchangeRates,
    datedChaptersRaw,
    undatedChapterCount,
    packingCount,
    pretripCount,
  ] = await Promise.all([
    db.stop.findMany({
      // Dated views follow the real plan — CONTEXT.md; consistent with
      // calendar/day/print/summary. Policy (not a BND-2 spelling exemption):
      // deliberately ignores `?plan=` — never wire in a variable plan here.
      where: { tripId, ...REAL_PLAN, arriveDate: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        country: true,
        lat: true,
        lng: true,
        timezone: true,
        arriveDate: true,
        departDate: true,
        sortOrder: true,
      },
    }),
    db.stop.count({ where: { tripId, ...REAL_PLAN, arriveDate: null } }),
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, sortOrder: true },
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
      },
    }),
    db.accommodation.findMany({
      where: { tripId, ...REAL_PLAN },
      select: {
        id: true,
        stopId: true,
        name: true,
        checkIn: true,
        checkOut: true,
      },
    }),
    db.item.findMany({
      where: { tripId, ...REAL_PLAN },
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
          select: {
            id: true,
            name: true,
            colour: true,
            startDate: true,
            endDate: true,
          },
        })
      : Promise.resolve([]),
    trip.chaptersEnabled
      ? db.chapter.count({ where: { tripId, ...REAL_PLAN, startDate: null } })
      : Promise.resolve(0),
    db.checklistItem.count({ where: { tripId, kind: "PACKING" } }),
    db.checklistItem.count({ where: { tripId, kind: "PRETRIP" } }),
  ]);

  // ---------------------------------------------------------------------------
  // Apply FX rates to costs (mirrors summary/page.tsx)
  // ---------------------------------------------------------------------------
  const costsWithRates = applyFxRatesToCosts({ costs, exchangeRates, homeCurrency });

  // ---------------------------------------------------------------------------
  // Narrow nullable date fields (mirrors summary/page.tsx)
  // ---------------------------------------------------------------------------
  // ADR 0038: a scheduled stop's position IS its dates — re-sort canonically
  // before rendering (the route map reads this array's order); the fetch's
  // orderBy stays sortOrder.
  const datedStops = orderPlanStops(
    datedStopsRaw.map((s) => ({
      ...s,
      arriveDate: s.arriveDate!,
      departDate: s.departDate!,
    })),
  );

  const datedChapters = datedChaptersRaw.map((c) => ({
    ...c,
    startDate: c.startDate!,
    endDate: c.endDate!,
  }));

  // ---------------------------------------------------------------------------
  // Build budget roll-up (mirrors summary/page.tsx)
  // ---------------------------------------------------------------------------
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
  });

  // ---------------------------------------------------------------------------
  // Upcoming payments (lib/upcoming-payments.ts) — same owner-label map as the
  // budget page (lib/cost-labels.ts), resolved against every stop (dated or
  // rough) so transport costs still label correctly.
  // ---------------------------------------------------------------------------
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
  const upcomingPayments = buildUpcomingPayments({ costs, ownerNames, today });

  // ---------------------------------------------------------------------------
  // Detect flags (mirrors summary/page.tsx)
  // ---------------------------------------------------------------------------
  const flagStops: FlagStop[] = datedStops.map((s) => ({ ...s, timezone: s.timezone ?? "UTC" }));
  const projection = await getTripProjection(tripId);
  const flags = detectFlags({
    stops: flagStops,
    transports: transports as FlagTransport[],
    accommodations: accommodations as FlagAccommodation[],
    items: items as FlagItem[],
    tripStart: startDate,
    tripEnd: endDate,
    roughStopCount: roughStops,
    projectedEnd: projection.projectedEnd,
    hardEndDate: projection.hardEndDate,
    drivingWindingFactor: trip.drivingWindingFactor,
    drivingAvgSpeedKph: trip.drivingAvgSpeedKph,
  });

  // ---------------------------------------------------------------------------
  // Build next steps
  // ---------------------------------------------------------------------------
  const sortedStops = allStopsRaw; // already ordered by sortOrder asc
  const home = tripHomeBase(trip);
  const firstStop = sortedStops[0] ?? null;
  const lastStop = sortedStops[sortedStops.length - 1] ?? null;

  const steps = buildNextSteps({
    flags,
    phase,
    nudges: {
      hasDates: true, // we only render PhasePlanning when dates exist
      undatedChapterCount,
      hasPackingList: packingCount > 0,
      hasPretripList: pretripCount > 0,
      unbookedTransportCount: transports.filter((t) => !t.depAt).length,
      hasHomeBase: !!home,
      hasOutboundLeg: hasOutboundLeg(transports, firstStop?.id ?? null),
      hasReturnLeg: hasReturnLeg(transports, lastStop?.id ?? null),
      roundTrip: trip.roundTrip,
      homeName: home?.name ?? null,
      firstStopName: firstStop?.name ?? null,
      lastStopName: lastStop?.name ?? null,
    },
    tripBasePath: base,
  });

  // ---------------------------------------------------------------------------
  // Derive phase description for the hero
  // ---------------------------------------------------------------------------
  const description = describePhase({
    startDate: trip.startDate,
    endDate: trip.endDate,
    today,
  });

  // ---------------------------------------------------------------------------
  // Build route map stops (mirrors summary/page.tsx)
  // ---------------------------------------------------------------------------
  const mapStops: RouteMapStop[] = datedStops.map((s) => {
    const ch = chapterForStop(s, datedChapters);
    return {
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
      chapterColour: ch ? chapterColourSwatch(ch.colour) : null,
      chapterName: ch?.name ?? null,
    };
  });

  // ---------------------------------------------------------------------------
  // Compose cards
  // ---------------------------------------------------------------------------
  const hero = (
    <CountdownHero
      key="hero"
      description={description}
      startDate={trip.startDate}
      endDate={trip.endDate}
      nights={daysBetween(startDate, endDate)}
      stopCount={allStopsRaw.length}
      homeCurrency={homeCurrency}
      urgent={phase === "final-prep"}
    />
  );

  const nextSteps = (
    <NextStepsCard key="steps" steps={steps} seeAllHref={`${base}/summary`} />
  );

  const actions = <QuickActions key="actions" tripId={tripId} phase={phase} />;

  const money = (
    <BudgetGlance
      key="budget"
      costTotalMinor={budget.grandTotal.costTotalMinor}
      paidTotalMinor={budget.grandTotal.paidTotalMinor}
      homeCurrency={homeCurrency}
      href={`${base}/budget`}
    />
  );

  const upcomingEl = (
    <UpcomingPaymentsCard key="upcoming-payments" payments={upcomingPayments} tripId={tripId} />
  );

  const route =
    mapStops.length > 0 ? (
      // The map draws its own kit frame (2px outline, hard shadow) — no Card around it.
      <RouteMap key="route" stops={mapStops} height={280} />
    ) : (
      // Kit shared/states.jsx "Plan" empty: the route has nothing to draw yet.
      <EmptyState
        key="route"
        icon={Route}
        tone="teal"
        title="No stops yet"
        description={
          allStopsRaw.length === 0
            ? "Add the first place. We'll draw the route as you go."
            : "Give your stops dates and we'll draw the route."
        }
      />
    );

  // Kit DHome.jsx grid: the coral countdown hero leads the main column
  // (route + next steps below it) beside a rail led by the "Spent" card
  // (budget + upcoming payments + quick actions). On mobile the grid
  // collapses to one column: hero → route → next steps → budget → actions.
  return (
    <div className={PLANNING_DESKTOP_GRID_CLASS} data-testid="planning-desktop-grid">
      <div className="flex flex-col gap-3.5">
        {hero}
        {route}
        {nextSteps}
      </div>
      <div className="flex flex-col gap-3.5" data-home-aside>
        {money}
        {upcomingEl}
        {actions}
        {reminders}
      </div>
    </div>
  );
}
