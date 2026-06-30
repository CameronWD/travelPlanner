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
import { Button } from "@/components/ui/button";
import { SpendSoFarCard } from "@/components/trip/spend-so-far-card";
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
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      {/* ── That's a wrap ── */}
      <section className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          That&apos;s a wrap
        </span>
        <p className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {trip.name}
        </p>
        <p className="text-sm text-muted-foreground">
          {datedStops.length} stop{datedStops.length === 1 ? "" : "s"} &middot;{" "}
          {totalNights} night{totalNights === 1 ? "" : "s"} &middot;{" "}
          {formatMoney(
            hasActual ? grandTotal.actualMinor : grandTotal.estimatedMinor,
            homeCurrency,
          )}{" "}
          {hasActual ? "spent" : "estimated"}
        </p>
      </section>

      {/* ── Spend retro ── */}
      <SpendSoFarCard spend={spend} homeCurrency={homeCurrency} />

      {/* ── Route map ── */}
      {mapStops.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-2 shadow-soft">
          <RouteMap stops={mapStops} height={280} />
        </section>
      )}

      {/* ── CTAs ── */}
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href={`${base}/journal`}>
            <NotebookPen className="size-4" aria-hidden="true" />
            {journalCount === 0
              ? "Write your first journal entry"
              : "Finish your journal"}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/trips/new">
            <PlaneTakeoff className="size-4" aria-hidden="true" />
            Plan another trip
          </Link>
        </Button>
      </div>
    </div>
  );
}
