import Link from "next/link";
import { NotebookPen, PlaneTakeoff } from "lucide-react";
import { db } from "@/lib/db";
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
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { RouteMapLoader as RouteMap } from "@/components/trip/route-map-loader";
import type { RouteMapStop } from "@/components/trip/route-map";

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

const COST_SELECT = {
  id: true,
  estimatedMinor: true,
  actualMinor: true,
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
  };
}

// ---------------------------------------------------------------------------
// Exported constant — tested by phase-past.test.tsx
// ---------------------------------------------------------------------------

/** Exported for className assertion in tests — must match the JSX below. */
export const PAST_DESKTOP_GRID_CLASS =
  "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_21.25rem] lg:items-start";

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
      where: { tripId, arriveDate: { not: null } },
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
      where: { tripId },
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
      where: { tripId },
      select: {
        id: true,
        stopId: true,
        name: true,
        checkIn: true,
        checkOut: true,
      },
    }),
    db.item.findMany({
      where: { tripId },
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
      where: { tripId },
      orderBy: { createdAt: "asc" },
      select: COST_SELECT,
    }),
    db.exchangeRate.findMany({
      where: { tripId },
      select: { base: true, quote: true, rate: true },
    }),
    db.chapter.findMany({
      where: { tripId, startDate: { not: null } },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        name: true,
        colour: true,
        startDate: true,
        endDate: true,
      },
    }),
    db.journalEntry.count({ where: { tripId } }),
  ]);

  // ---------------------------------------------------------------------------
  // Apply FX rates to costs
  // ---------------------------------------------------------------------------
  const costsWithRates = applyFxRatesToCosts({ costs, exchangeRates, homeCurrency });

  // ---------------------------------------------------------------------------
  // Narrow nullable date fields
  // ---------------------------------------------------------------------------
  const datedStops = datedStopsRaw.map((s) => ({
    ...s,
    arriveDate: s.arriveDate!,
    departDate: s.departDate!,
  }));

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
  const hasActual = grandTotal.actualMinor > 0;

  // Spend retro: use trip end as "today" so tripElapsedPct reads 100 %
  const spend = buildSpendSoFar({
    costs: costs as SpendCost[],
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
  const spentMinor = hasActual ? grandTotal.actualMinor : grandTotal.estimatedMinor;
  const paidMinor = spend.paidSoFarMinor;
  const estimatedMinor = spend.estimatedTotalMinor;
  const varianceMinor = spend.varianceMinor;
  const underBudget = varianceMinor <= 0;
  const pct = estimatedMinor > 0 ? Math.min(100, Math.round((paidMinor / estimatedMinor) * 100)) : 0;

  // ---------------------------------------------------------------------------
  // Compose cards
  // ---------------------------------------------------------------------------
  const recapHero = (
    <section className="relative overflow-hidden rounded-3xl bg-[hsl(24_14%_15%)] p-6 text-white">
      <div className="pointer-events-none absolute -right-8 -top-8 size-[150px] rounded-full bg-white/[0.06]" aria-hidden="true" />
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">That&apos;s a wrap</p>
      <p className="mt-2 font-display text-2xl font-bold">{trip.name}</p>
      <div className="mt-4 flex gap-5">
        <div><div className="font-display text-2xl font-bold">{stopCount}</div><div className="text-[11px] text-white/60">stops</div></div>
        <div><div className="font-display text-2xl font-bold">{totalNights}</div><div className="text-[11px] text-white/60">nights</div></div>
        <div><div className="font-display text-2xl font-bold">{formatMoney(spentMinor, trip.homeCurrency)}</div><div className="text-[11px] text-white/60">{hasActual ? "spent" : "estimated"}</div></div>
      </div>
    </section>
  );

  const finalSpend = (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Final spend</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", underBudget ? "bg-success/15 text-success" : "bg-over/10 text-over")}>
          {formatMoney(Math.abs(varianceMinor), trip.homeCurrency)} {underBudget ? "under" : "over"}
        </span>
      </div>
      <p className="font-display text-2xl font-bold text-foreground">
        {formatMoney(paidMinor, trip.homeCurrency)} <span className="text-sm font-medium text-muted-foreground">of {formatMoney(estimatedMinor, trip.homeCurrency)} estimated</span>
      </p>
      <span className="mt-3 block h-2 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </span>
    </section>
  );

  const routeMap = mapStops.length > 0 ? (
    <section className="overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-soft">
      <RouteMap stops={mapStops} height={200} />
    </section>
  ) : null;

  const ctas = (
    <div className="flex gap-3">
      <Button asChild variant="primary" className="flex-1">
        <Link href={`${base}/journal`}>
          <NotebookPen className="size-4" aria-hidden="true" />
          {journalCount === 0
            ? "Write your first journal entry"
            : "Finish your journal"}
        </Link>
      </Button>
      <Button asChild variant="outline" className="flex-1 border-2 border-foreground">
        <Link href="/trips/new">
          <PlaneTakeoff className="size-4" aria-hidden="true" />
          Plan another trip
        </Link>
      </Button>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render — Bold Modular desktop (E2): full-width recap hero, then a main
  // column (route map) beside a right rail (final spend + CTAs). On mobile the
  // grid collapses to one column: hero → route map → final spend → CTAs.
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      {recapHero}
      <div className={PAST_DESKTOP_GRID_CLASS} data-testid="past-grid">
        {/* Main: route map */}
        <div className="flex flex-col gap-6 lg:order-1">
          {routeMap}
        </div>
        {/* Rail: final spend + CTAs */}
        <div className="flex flex-col gap-6 lg:order-2">
          {finalSpend}
          {ctas}
        </div>
      </div>
    </div>
  );
}
