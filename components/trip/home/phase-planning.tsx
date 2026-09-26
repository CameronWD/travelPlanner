import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { daysBetween } from "@/lib/dates";
import { describePhase, type TripPhase } from "@/lib/trip-phase";
import {
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
import { buildTripNextSteps } from "@/lib/next-steps-builder";
import { tripHomeBase } from "@/lib/home-base";
import { getTripProjection } from "@/server/actions/stops";
import { chapterForStop } from "@/lib/chapters";
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
import { StatTile } from "@/components/trip/home/stat-tile";
import { formatMoneyCompact } from "@/lib/money";
import type { ReminderItem } from "@/server/actions/reminders";

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
   * this phase places it last, full width below the tile grids. */
  reminders?: ReactNode;
  /** The Reminders the page already listed for that card — summarised in the
   * "Reminders" stat tile (count + next), so no second query. */
  reminderItems?: ReminderItem[];
  /** The cover as a grid tile (spec E2), rendered by the page — it sits beside
   * the countdown hero here instead of full width above the Phase. */
  cover?: ReactNode;
}

/** Exported for className assertion in tests — must match the JSX below. */
export const PLANNING_DESKTOP_GRID_CLASS =
  "grid grid-cols-1 gap-3.5 lg:grid-cols-3 lg:grid-rows-[auto_auto] lg:items-stretch";

/** The second row of tiles (map, next steps, quick actions) at tile widths. */
const PLANNING_TILE_ROW_CLASS = "grid grid-cols-1 gap-3.5 lg:grid-cols-3 lg:items-start";

export async function PhasePlanning({
  tripId,
  trip,
  today,
  phase,
  reminders,
  reminderItems = [],
  cover,
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
  // Detect flags + build next steps — shared with the trips list's featured
  // card (lib/next-steps-builder.ts's `buildTripNextSteps`), so the two never
  // drift apart. This page already has all the data that pure combiner needs
  // (fetched above for the budget/route/etc), so it's passed in directly
  // rather than re-fetched.
  // ---------------------------------------------------------------------------
  const projection = await getTripProjection(tripId);
  const steps = buildTripNextSteps({
    tripBasePath: base,
    phase,
    tripStart: startDate,
    tripEnd: endDate,
    roundTrip: trip.roundTrip,
    home: tripHomeBase(trip),
    datedStops: datedStops.map((s) => ({ ...s, timezone: s.timezone ?? "UTC" })),
    roughStopCount: roughStops,
    allStops: allStopsRaw, // already ordered by sortOrder asc
    transports: transports as FlagTransport[],
    accommodations: accommodations as FlagAccommodation[],
    items: items as FlagItem[],
    projectedEnd: projection.projectedEnd,
    hardEndDate: projection.hardEndDate,
    drivingWindingFactor: trip.drivingWindingFactor,
    drivingAvgSpeedKph: trip.drivingAvgSpeedKph,
    undatedChapterCount,
    hasPackingList: packingCount > 0,
    hasPretripList: pretripCount > 0,
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
      sortOrder: s.sortOrder,
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
      <RouteMap key="route" stops={mapStops} aspect="4/3" />
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

  // Stat tiles beside the hero (spec E1) — fed by what this page already
  // built for BudgetGlance / UpcomingPaymentsCard and the page's Reminders.
  const nextPayment = upcomingPayments[0] ?? null;
  const nextReminder = reminderItems[0] ?? null;
  // The tiles are the desktop's money + reminders summary; on a phone the
  // full money cards keep their slot below Next steps instead (layout
  // unchanged there), so the tiles only show from lg.
  const statTiles = [
    <StatTile
      key="cost"
      className="hidden lg:flex"
      tone="sun"
      label="Cost so far"
      value={formatMoneyCompact(budget.grandTotal.costTotalMinor, homeCurrency)}
      sub={<>{formatMoneyCompact(budget.grandTotal.paidTotalMinor, homeCurrency)} paid · shared pot</>}
      href={`${base}/budget`}
    />,
    <StatTile
      key="next-payment"
      className="hidden lg:flex"
      tone="teal"
      label="Next payment"
      value={nextPayment ? formatMoneyCompact(nextPayment.costMinor, nextPayment.currency) : "Nothing due"}
      sub={nextPayment ? `${nextPayment.label} · ${paymentWhen(nextPayment.daysUntil)}` : "No unpaid cost has a due date"}
      href={`${base}/budget`}
    />,
    <StatTile
      key="reminders"
      className="hidden lg:flex"
      tone="lilac"
      label="Reminders"
      value={reminderItems.length}
      sub={nextReminder ? `Next: ${nextReminder.title}` : "Nothing to remember yet"}
    />,
  ];

  // Kit DHome.jsx grid (spec E1): the coral countdown hero spans two rows of
  // the three-column grid, the cover tile and the stat tiles beside it; the
  // map, next steps and quick actions follow at tile widths; Reminders last,
  // full width. On a phone every grid collapses to one column in the order
  // hero → cover → route → next steps → money → actions → reminders.
  return (
    <div className="flex flex-col gap-3.5">
      <div className={PLANNING_DESKTOP_GRID_CLASS} data-testid="planning-desktop-grid">
        {hero}
        {cover}
        {statTiles}
      </div>
      <div className={PLANNING_TILE_ROW_CLASS} data-testid="planning-tile-row">
        {route}
        {nextSteps}
        <div className="flex flex-col gap-3.5 lg:hidden" data-home-money>
          {money}
          {upcomingEl}
        </div>
        {actions}
      </div>
      {reminders}
    </div>
  );
}

/** The "Next payment" tile's timing, in the Upcoming payments card's words. */
function paymentWhen(daysUntil: number): string {
  if (daysUntil === 0) return "due today";
  if (daysUntil === 1) return "due tomorrow";
  if (daysUntil > 1) return `due in ${daysUntil} days`;
  return "overdue";
}
