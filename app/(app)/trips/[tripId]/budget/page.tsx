import { notFound } from "next/navigation";
import { Wallet, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OtherCostEditor } from "@/components/trip/other-cost-editor";
import { CostAmounts } from "@/components/trip/cost-amounts";
import { RatesPanel } from "@/components/trip/rates-panel";
import { buildBudget } from "@/lib/budget";
import { isRateStale } from "@/lib/fx";
import type { RateEntry } from "@/components/trip/rates-panel";
import { ChapterChip } from "@/components/trip/chapter-chip";
import type { BudgetCost, BudgetStopWithDates, BudgetItem, BudgetAccommodation, BudgetTransport } from "@/lib/budget";
import { buildSpendSoFar } from "@/lib/spend-so-far";
import type { SpendCost } from "@/lib/spend-so-far";
import { SpendSoFarCard } from "@/components/trip/spend-so-far-card";
import { todayISO, nightsBetween } from "@/lib/dates";
import { BudgetHeroRow } from "@/components/trip/budget-hero-row";

// ---------------------------------------------------------------------------
// Data fetching
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
// Layout constants (exported for unit tests)
// ---------------------------------------------------------------------------

export const BUDGET_DESKTOP_GRID_CLASS =
  "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start";

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function BudgetPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { homeCurrency: true, startDate: true, endDate: true },
  });
  if (!trip) notFound();
  // The budget roll-up enumerates every trip day; a date-less trip has no
  // dated window to spread costs across yet.
  if (!trip.startDate || !trip.endDate) {
    return (
      <EmptyState
        icon={Wallet}
        title="No dates yet"
        description="Set your trip's start and end dates to see a budget breakdown."
      />
    );
  }

  const { homeCurrency, startDate, endDate } = trip;

  // Fetch everything in parallel
  const [allCosts, stops, items, accommodations, transports, exchangeRates, chapters] = await Promise.all([
    db.cost.findMany({
      where: { tripId, forkId: null },
      orderBy: { createdAt: "asc" },
      select: COST_SELECT,
    }),
    db.stop.findMany({
      // Rough (date-less) stops carry no costs onto the dated budget.
      where: { tripId, forkId: null, arriveDate: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true },
    }),
    db.item.findMany({
      where: { tripId, forkId: null },
      select: { id: true, stopId: true, category: true, date: true },
    }),
    db.accommodation.findMany({
      where: { tripId, forkId: null },
      select: { id: true, stopId: true, checkIn: true, checkOut: true },
    }),
    db.transport.findMany({
      where: { tripId, forkId: null },
      select: { id: true, fromStopId: true, toStopId: true, depAt: true },
    }),
    db.exchangeRate.findMany({
      where: { tripId },
      select: { base: true, quote: true, rate: true, manual: true, fetchedAt: true },
    }),
    db.chapter.findMany({
      // Rough (date-less) chapters have no dated window, so buildBudget would
      // emit a blank $0 row for each — match the summary page and exclude them.
      where: { tripId, forkId: null, startDate: { not: null } },
      orderBy: { startDate: "asc" },
      select: { id: true, name: true, colour: true, startDate: true, endDate: true },
    }),
  ]);

  // Separate OTHER costs for the editor
  const otherCosts = allCosts.filter((c) => c.ownerType === "OTHER");

  // Build budget input
  const budgetCosts: BudgetCost[] = allCosts.map((c) => ({
    id: c.id,
    estimatedMinor: c.estimatedMinor,
    actualMinor: c.actualMinor,
    currency: c.currency,
    rateToHome: c.rateToHome,
    ownerType: c.ownerType as BudgetCost["ownerType"],
    ownerId: c.ownerId,
    label: c.label,
    category: c.category,
  }));

  // Non-null at runtime: the query filters rough (date-less) stops out.
  const budgetStops: BudgetStopWithDates[] = stops.map((s) => ({
    id: s.id,
    name: s.name,
    timezone: s.timezone,
    arriveDate: s.arriveDate!,
    departDate: s.departDate!,
    sortOrder: s.sortOrder,
  }));

  const budgetItems: BudgetItem[] = items.map((i) => ({
    id: i.id,
    stopId: i.stopId,
    category: i.category,
    date: i.date,
  }));

  const budgetAccommodations: BudgetAccommodation[] = accommodations.map((a) => ({
    id: a.id,
    stopId: a.stopId,
    checkIn: a.checkIn,
    checkOut: a.checkOut,
  }));

  const budgetTransports: BudgetTransport[] = transports.map((t) => ({
    id: t.id,
    fromStopId: t.fromStopId,
    toStopId: t.toStopId,
    depAt: t.depAt,
  }));

  const budget = buildBudget({
    homeCurrency,
    costs: budgetCosts,
    stops: budgetStops,
    items: budgetItems,
    accommodations: budgetAccommodations,
    transports: budgetTransports,
    tripStart: startDate,
    tripEnd: endDate,
    chapters,
  });

  // Build SpendCost[] — same as budgetCosts but with paidAt from allCosts
  const spendCosts: SpendCost[] = allCosts.map((c) => ({
    id: c.id,
    estimatedMinor: c.estimatedMinor,
    actualMinor: c.actualMinor,
    currency: c.currency,
    rateToHome: c.rateToHome,
    ownerType: c.ownerType as SpendCost["ownerType"],
    ownerId: c.ownerId,
    label: c.label,
    category: c.category,
    paidAt: c.paidAt,
  }));

  const spend = buildSpendSoFar({
    costs: spendCosts,
    homeCurrency,
    tripStart: startDate,
    tripEnd: endDate,
    today: todayISO(),
  });

  // Build rates data for the panel
  // Distinct foreign currencies from all costs
  const foreignCurrencies = [
    ...new Set(
      allCosts
        .map((c) => c.currency.toUpperCase())
        .filter((c) => c !== homeCurrency.toUpperCase()),
    ),
  ].sort();

  const rateByBase = new Map(
    exchangeRates
      .filter((r) => r.quote.toUpperCase() === homeCurrency.toUpperCase())
      .map((r) => [r.base.toUpperCase(), r]),
  );

  const now = new Date();

  const rateEntries: RateEntry[] = foreignCurrencies.map((currency) => {
    const stored = rateByBase.get(currency);
    if (!stored) {
      return { currency, rate: null, source: "none" as const, stale: false };
    }
    const source = stored.manual ? "manual" : "fetched";
    const stale = !stored.manual && isRateStale(stored.fetchedAt.getTime(), now.getTime());
    return {
      currency,
      rate: stored.rate,
      source: stale ? "stale" : source,
      stale,
    } as RateEntry;
  });

  const hasAnyCosts = allCosts.length > 0;

  // Per-day data — only days with non-zero costs for the compact strip
  const daysWithCosts = budget.byDay.filter(
    (d) => d.estimatedMinor > 0 || d.actualMinor > 0,
  );

  // Build per-row missing-rate indicators: which categories have costs whose
  // currency has no exchange rate? Used to show inline badges below the banner.
  const missingRateCurrencies = new Set(budget.missingRates);
  const categoriesWithMissingRates = new Set<string>(
    allCosts
      .filter(
        (c) =>
          c.currency.toUpperCase() !== homeCurrency.toUpperCase() &&
          missingRateCurrencies.has(c.currency.toUpperCase()),
      )
      .map((c) => c.category ?? "Other"),
  );

  if (!hasAnyCosts) {
    return (
      <EmptyState
        icon={Wallet}
        title="No costs yet"
        description="Costs appear here as you add them to flights, hotels, and activities. Use 'Other costs' below for everything else — insurance, visas, eSIMs, and spending money."
        action={
          <div className="w-full max-w-md">
            <OtherCostEditor
              tripId={tripId}
              costs={otherCosts}
              homeCurrency={homeCurrency}
              defaultCurrency={homeCurrency}
            />
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="sr-only">Budget</h2>

      {/* Missing rates warning */}
      {budget.hasMissingRates && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3">
          <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-300">
              Some costs are missing exchange rates
            </p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-400">
              {budget.missingRates.join(", ")} — costs in these currencies are excluded from totals.
              Set rates in the <strong>Exchange Rates</strong> section below.
            </p>
          </div>
        </div>
      )}

      {/* 4-up hero: Estimated total · Paid · Still to pay · Est / day */}
      <BudgetHeroRow
        estimatedMinor={budget.grandTotal.estimatedMinor}
        paidMinor={spend.paidSoFarMinor}
        homeCurrency={homeCurrency}
        tripNights={nightsBetween(startDate, endDate)}
      />

      {/* Spend so far card */}
      <SpendSoFarCard spend={spend} homeCurrency={homeCurrency} />

      {/* Legend for the estimated-vs-spent columns shown in the sections below */}
      <div className="flex items-center justify-end gap-4 px-1 text-xs text-muted-foreground">
        <span>Estimated</span>
        <span className="text-emerald-600 dark:text-emerald-400">Spent</span>
      </div>

      {/* Two-column grid: main roll-up | right rail (rates + other costs) */}
      <div className={BUDGET_DESKTOP_GRID_CLASS} data-testid="budget-grid">

        {/* ── Main column ── */}
        <div className="flex flex-col gap-6 lg:order-1">

          {/* By category */}
          {budget.byCategory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>By category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  {budget.byCategory.map((cat) => {
                    const pct =
                      budget.grandTotal.estimatedMinor > 0
                        ? Math.round((cat.estimatedMinor / budget.grandTotal.estimatedMinor) * 100)
                        : 0;
                    return (
                      <div key={cat.category} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate font-medium">{cat.category}</span>
                            {categoriesWithMissingRates.has(cat.category) && (
                              <span
                                title="Some costs in this category are excluded — missing exchange rate"
                                aria-label="Missing rate"
                                className="shrink-0 inline-flex items-center gap-0.5 rounded-sm bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                              >
                                <AlertTriangle className="size-2.5" aria-hidden="true" />
                                No rate
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-3 tabular-nums text-right">
                            <span className="text-muted-foreground text-xs" title="% of estimated">{pct}% est.</span>
                            <CostAmounts
                              estimatedMinor={cat.estimatedMinor}
                              actualMinor={cat.actualMinor}
                              currency={homeCurrency}
                            />
                          </div>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/70 transition-all"
                            style={{ width: `${pct}%` }}
                            aria-label={`${pct}% of budget`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* By stop */}
          {budget.byStop.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>By destination</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border">
                  {budget.byStop.map((stop) => (
                    <div
                      key={stop.stopId ?? "tripwide"}
                      className="flex items-center justify-between py-2.5 gap-2"
                    >
                      <span className="min-w-0 truncate text-sm font-medium">{stop.stopName}</span>
                      <CostAmounts
                        estimatedMinor={stop.estimatedMinor}
                        actualMinor={stop.actualMinor}
                        currency={homeCurrency}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* By chapter */}
          {budget.byChapter.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>By chapter</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border">
                  {budget.byChapter.map((row) => (
                    <div
                      key={row.chapterId}
                      className="flex items-center justify-between py-2.5 gap-2"
                    >
                      <ChapterChip name={row.chapterName} colour={row.colour} />
                      <CostAmounts
                        estimatedMinor={row.estimatedMinor}
                        actualMinor={row.actualMinor}
                        currency={homeCurrency}
                      />
                    </div>
                  ))}
                  {/* Reconciliation rows — shown only when non-zero */}
                  {(budget.chapterReconciliation.ungrouped.estimatedMinor > 0 ||
                    budget.chapterReconciliation.ungrouped.actualMinor > 0) && (
                    <div className="flex items-center justify-between py-2.5 gap-2">
                      <span className="min-w-0 truncate text-sm text-muted-foreground">Ungrouped</span>
                      <CostAmounts
                        estimatedMinor={budget.chapterReconciliation.ungrouped.estimatedMinor}
                        actualMinor={budget.chapterReconciliation.ungrouped.actualMinor}
                        currency={homeCurrency}
                        className="text-muted-foreground"
                      />
                    </div>
                  )}
                  {(budget.chapterReconciliation.betweenLegs.estimatedMinor > 0 ||
                    budget.chapterReconciliation.betweenLegs.actualMinor > 0) && (
                    <div className="flex items-center justify-between py-2.5 gap-2">
                      <span className="min-w-0 truncate text-sm text-muted-foreground">Between legs</span>
                      <CostAmounts
                        estimatedMinor={budget.chapterReconciliation.betweenLegs.estimatedMinor}
                        actualMinor={budget.chapterReconciliation.betweenLegs.actualMinor}
                        currency={homeCurrency}
                        className="text-muted-foreground"
                      />
                    </div>
                  )}
                  {(budget.chapterReconciliation.otherCosts.estimatedMinor > 0 ||
                    budget.chapterReconciliation.otherCosts.actualMinor > 0) && (
                    <div className="flex items-center justify-between py-2.5 gap-2">
                      <span className="min-w-0 truncate text-sm text-muted-foreground">Other costs</span>
                      <CostAmounts
                        estimatedMinor={budget.chapterReconciliation.otherCosts.estimatedMinor}
                        actualMinor={budget.chapterReconciliation.otherCosts.actualMinor}
                        currency={homeCurrency}
                        className="text-muted-foreground"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-day costs */}
          {daysWithCosts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Day by day</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1">
                  {daysWithCosts.map((day) => (
                    <div
                      key={day.dateISO}
                      className="flex items-center justify-between py-1.5 gap-2"
                    >
                      <span className="text-sm text-muted-foreground tabular-nums font-mono">
                        {day.dateISO}
                      </span>
                      <CostAmounts
                        estimatedMinor={day.estimatedMinor}
                        actualMinor={day.actualMinor}
                        currency={homeCurrency}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

        </div>{/* end main column */}

        {/* ── Right rail (desktop) / below roll-up (mobile) ── */}
        <div className="flex flex-col gap-6 lg:order-2">

          {/* Exchange rates */}
          {foreignCurrencies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Exchange rates</CardTitle>
              </CardHeader>
              <CardContent>
                <RatesPanel
                  tripId={tripId}
                  homeCurrency={homeCurrency}
                  rates={rateEntries}
                />
              </CardContent>
            </Card>
          )}

          {/* Other costs */}
          <Card>
            <CardHeader>
              <CardTitle>Other costs</CardTitle>
            </CardHeader>
            <CardContent>
              <OtherCostEditor
                tripId={tripId}
                costs={otherCosts}
                homeCurrency={homeCurrency}
                defaultCurrency={homeCurrency}
              />
            </CardContent>
          </Card>

        </div>{/* end right rail */}

      </div>{/* end budget-grid */}
    </div>
  );
}
