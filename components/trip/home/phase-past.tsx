import Link from "next/link";
import { NotebookPen, PlaneTakeoff, Route } from "lucide-react";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { nightsBetween } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  buildBudget,
  applyFxRatesToCosts,
  type BudgetStopWithDates,
  type BudgetItem,
  type BudgetAccommodation,
  type BudgetTransport,
} from "@/lib/budget";
import { buildSpendSoFar, type SpendCost } from "@/lib/spend-so-far";
import { chapterForStop } from "@/lib/chapters";
import { chapterColourSwatch } from "@/lib/chapter-colours";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { RouteMapLoader as RouteMap } from "@/components/trip/route-map-loader";
import type { RouteMapStop } from "@/components/trip/route-map";
import { orderPlanStops } from "@/lib/plan-order";

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

const COST_SELECT = {
  id: true,
  costMinor: true,
  paidMinor: true,
  currency: true,
  rateToHome: true,
  paidAt: true,
  ownerType: true,
  ownerId: true,
  label: true,
  category: true,
} as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PhasePastProps {
  tripId: string;
  trip: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    homeCurrency: string;
    chaptersEnabled: boolean;
  };
}

// ---------------------------------------------------------------------------
// Exported constant — tested by phase-past.test.tsx
// ---------------------------------------------------------------------------

/** Exported for className assertion in tests — must match the JSX below. */
export const PAST_DESKTOP_GRID_CLASS =
  "grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_21.25rem] lg:items-start";

/**
 * Exported for className assertion in tests — must match the JSX below.
 * Stacked below `sm` so the two CTA buttons' full label text (e.g. "Plan
 * another trip") never gets clipped at 320–374px viewports; side by side
 * from `sm` up; stacked again at `lg`, where they sit in the 340px rail.
 */
export const PAST_CTAS_ROW_CLASS = "flex flex-col gap-3 sm:flex-row lg:flex-col";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export async function PhasePast({ tripId, trip }: PhasePastProps) {
  const base = `/trips/${tripId}`;
  if (!trip.startDate) return null;

  const startDate = trip.startDate;
  const endDate = trip.endDate ?? startDate;
  const homeCurrency = trip.homeCurrency;

  const [
    datedStopsRaw,
    transports,
    accommodations,
    items,
    costs,
    exchangeRates,
    datedChaptersRaw,
    journalCount,
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
        lat: true,
        lng: true,
        timezone: true,
        arriveDate: true,
        departDate: true,
        sortOrder: true,
      },
    }),
    db.transport.findMany({
      where: { tripId, ...REAL_PLAN },
      select: {
        id: true,
        mode: true,
        fromStopId: true,
        toStopId: true,
        depAt: true,
        arrAt: true,
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
        stopId: true,
        category: true,
        date: true,
        startTime: true,
        endTime: true,
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
    // A disabled trip renders as if it had no chapters (Task 13) — skip the
    // query entirely rather than fetch-then-discard.
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
    db.journalEntry.count({ where: { tripId } }),
  ]);

  // ---------------------------------------------------------------------------
  // Apply FX rates to costs
  // ---------------------------------------------------------------------------
  const costsWithRates = applyFxRatesToCosts({ costs, exchangeRates, homeCurrency });

  // ---------------------------------------------------------------------------
  // Narrow nullable date fields
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
  // Build budget roll-up
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
  // Derived values
  // ---------------------------------------------------------------------------
  const totalNights = nightsBetween(startDate, endDate);
  const { grandTotal } = budget;

  // Spend retro: use trip end as "today" so tripElapsedPct reads 100 %.
  // Fed the same FX-applied costs as the budget roll-up, so "Trip cost" and
  // "of X cost" can never disagree on a multi-currency trip.
  const spend = buildSpendSoFar({
    costs: costsWithRates as SpendCost[],
    homeCurrency,
    tripStart: startDate,
    tripEnd: endDate,
    today: endDate,
  });

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
  // Final spend derived values
  // ---------------------------------------------------------------------------
  const stopCount = datedStops.length;
  const paidSoFarMinor = spend.paidSoFarMinor;
  const costTotalMinor = spend.costTotalMinor;
  const varianceMinor = spend.varianceMinor;
  const underBudget = varianceMinor <= 0;
  const pct = costTotalMinor > 0 ? Math.min(100, Math.round((paidSoFarMinor / costTotalMinor) * 100)) : 0;

  // ---------------------------------------------------------------------------
  // Compose cards — kit shared/onthego.jsx "Summary": a title, then the
  // StatCard row (teal nights · sun trip cost · lilac paid so far).
  // ---------------------------------------------------------------------------
  const recap = (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] text-foreground lg:text-4xl">
        That&apos;s a wrap
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          tone="teal"
          label="Nights"
          value={totalNights}
          sub={`${stopCount} ${stopCount === 1 ? "stop" : "stops"}`}
        />
        <StatCard
          tone="sun"
          label="Trip cost"
          value={formatMoney(grandTotal.costTotalMinor, trip.homeCurrency)}
          sub="shared pot"
        />
        <StatCard
          tone="lilac"
          label="Paid so far"
          value={formatMoney(paidSoFarMinor, trip.homeCurrency)}
          progress={pct}
          className="col-span-2 lg:col-span-1"
          sub={
            <span className="flex flex-wrap items-center gap-1.5">
              <span>
                {pct}% of {formatMoney(costTotalMinor, trip.homeCurrency)} cost
              </span>
              {/* Under/over is a state: status tokens, not an accent hue. */}
              <Badge
                variant={underBudget ? undefined : "destructive"}
                className={underBudget ? "bg-success text-success-foreground" : undefined}
              >
                {formatMoney(Math.abs(varianceMinor), trip.homeCurrency)} {underBudget ? "under" : "over"}
              </Badge>
            </span>
          }
        />
      </div>
    </div>
  );

  const routeMap = mapStops.length > 0 ? (
    // The map draws its own kit frame (2px outline, hard shadow) — no Card around it.
    <RouteMap stops={mapStops} height={200} />
  ) : (
    // Kit shared/states.jsx "Plan" empty — the route has nothing to draw.
    <EmptyState
      icon={Route}
      tone="teal"
      title="No stops yet"
      description="Give the places you went dates and we'll draw the route."
    />
  );

  const ctas = (
    <div className={PAST_CTAS_ROW_CLASS}>
      <Button asChild variant="primary" className="sm:flex-1 lg:flex-none">
        <Link href={`${base}/journal`}>
          <NotebookPen className="size-4" aria-hidden="true" />
          {journalCount === 0
            ? "Write your first journal entry"
            : "Finish your journal"}
        </Link>
      </Button>
      <Button asChild variant="secondary" className="sm:flex-1 lg:flex-none">
        <Link href="/trips/new">
          <PlaneTakeoff className="size-4" aria-hidden="true" />
          Plan another trip
        </Link>
      </Button>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render — full-width recap (title + stat row), then a main column (route
  // map) beside a right rail (CTAs). On mobile the grid collapses to one
  // column: recap → route map → CTAs.
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-3.5 lg:gap-[18px]">
      {recap}
      <div className={PAST_DESKTOP_GRID_CLASS} data-testid="past-grid">
        {/* Main: route map */}
        <div className="flex flex-col gap-3.5 lg:order-1">
          {routeMap}
        </div>
        {/* Rail: CTAs */}
        <div className="flex flex-col gap-3.5 lg:order-2">
          {ctas}
        </div>
      </div>
    </div>
  );
}
