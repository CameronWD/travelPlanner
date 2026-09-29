import type { ReactNode } from "react";
import { daysBetween } from "@/lib/dates";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { describePhase, type TripPhase } from "@/lib/trip-phase";
import { loadHomePlanningData } from "@/lib/desktop-home-loader";
import { chapterForStop } from "@/lib/chapters";
import { Route } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { CountdownHero } from "@/components/trip/home/countdown-hero";
import { NextStepsCard } from "@/components/trip/home/next-steps-card";
import { BudgetGlance } from "@/components/trip/home/budget-glance";
import { QuickActions } from "@/components/trip/home/quick-actions";
import { RouteMapLoader as RouteMap } from "@/components/trip/route-map-loader";
import type { RouteMapStop } from "@/components/trip/route-map";
import { UpcomingPaymentsCard } from "@/components/trip/upcoming-payments-card";
import { StatTile } from "@/components/trip/home/stat-tile";
import { formatMoneyCompact } from "@/lib/money";
import type { ReminderItem } from "@/server/actions/reminders";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { HOME_GRID_GAP, HOME_STACK } from "@/components/trip/home/spacing";

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
  `grid grid-cols-1 ${HOME_GRID_GAP} lg:grid-cols-3 lg:grid-rows-[auto_auto] lg:items-stretch`;

/** The second row of tiles (map, next steps, quick actions) at tile widths. */
const PLANNING_TILE_ROW_CLASS = `grid grid-cols-1 ${HOME_GRID_GAP} lg:grid-cols-3 lg:items-start`;

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

  const slug = await tripSlugFor(tripId);
  const base = tripPath(slug);
  const startDate = trip.startDate!;
  const endDate = trip.endDate ?? startDate;
  const homeCurrency = trip.homeCurrency;

  // One query path for the Home's planning data (lib/desktop-home-loader.ts),
  // shared with the desktop Home tiles on the same request.
  const { datedStops, planStops, datedChapters, budget, upcomingPayments, steps: allSteps } =
    await loadHomePlanningData(tripId, today, phase, trip);
  const steps = allSteps.slice(0, 4);

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
      stopCount={planStops.length}
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
    <UpcomingPaymentsCard key="upcoming-payments" payments={upcomingPayments} tripId={tripId} tripSlug={slug} />
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
          planStops.length === 0
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
  // cover → hero → route → next steps → money → actions → reminders.
  return (
    <div className={HOME_STACK}>
      {/* Spec H4: staggered entrance for the home tile grids on mount. */}
      <AnimatedList
        as="div"
        className={PLANNING_DESKTOP_GRID_CLASS}
        data-testid="planning-desktop-grid"
        staggerOnMount
      >
        {/* Grid-placement/visibility classes that used to live on the tile's
            own root element must be repeated on the AnimatedItem: it is now
            the direct grid child, and row-span/col-span (and the stat tiles'
            `hidden` at non-lg — an un-hidden empty grid cell would still eat
            a track + gap) only take effect on the element that IS the grid
            item, not a nested descendant of it. */}
        <AnimatedItem key="hero" index={0} className="lg:row-span-2">{hero}</AnimatedItem>
        {/* Phones keep the single-column Home unchanged: the cover band
            sits ABOVE the hero (-order-1), and returns to grid order beside
            the hero at lg. */}
        {cover ? (
          <AnimatedItem key="cover" index={1} className="-order-1 lg:order-none">
            {cover}
          </AnimatedItem>
        ) : null}
        {statTiles.map((tile, i) => (
          <AnimatedItem
            key={typeof tile.key === "string" ? tile.key : `stat-${i}`}
            index={(cover ? 2 : 1) + i}
            className="hidden lg:flex"
          >
            {tile}
          </AnimatedItem>
        ))}
      </AnimatedList>
      <AnimatedList
        as="div"
        className={PLANNING_TILE_ROW_CLASS}
        data-testid="planning-tile-row"
        staggerOnMount
      >
        <AnimatedItem key="route" index={0}>{route}</AnimatedItem>
        <AnimatedItem key="next-steps" index={1}>{nextSteps}</AnimatedItem>
        {/* This tile is lg:hidden itself (spec E1's desktop stat tiles take
            over from lg) — repeated on the AnimatedItem grid item for the
            same reason as the desktop grid above: an un-hidden empty grid
            cell would still claim a track + gap at lg. */}
        <AnimatedItem key="money" index={2} className="lg:hidden">
          <div className={`${HOME_STACK} lg:hidden`} data-home-money>
            {money}
            {upcomingEl}
          </div>
        </AnimatedItem>
        <AnimatedItem key="actions" index={3}>{actions}</AnimatedItem>
      </AnimatedList>
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
