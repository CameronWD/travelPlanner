import { notFound } from "next/navigation";
import { Wallet, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { formatMoney } from "@/lib/money";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OtherCostEditor } from "@/components/trip/other-cost-editor";
import { RatesPanel } from "@/components/trip/rates-panel";
import { buildBudget } from "@/lib/budget";
import type { RateEntry } from "@/components/trip/rates-panel";
import type { BudgetCost, BudgetStop, BudgetItem, BudgetAccommodation, BudgetTransport } from "@/lib/budget";

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
// Small server-only helpers
// ---------------------------------------------------------------------------

function formatGap(gapMinor: number, currency: string) {
  const abs = Math.abs(gapMinor);
  const formatted = formatMoney(abs, currency);
  if (gapMinor > 0) return { label: `${formatted} under`, positive: true };
  if (gapMinor < 0) return { label: `${formatted} over`, positive: false };
  return { label: "on budget", positive: true };
}

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

  const { homeCurrency, startDate, endDate } = trip;

  // Fetch everything in parallel
  const [allCosts, stops, items, accommodations, transports, exchangeRates] = await Promise.all([
    db.cost.findMany({
      where: { tripId },
      orderBy: { createdAt: "asc" },
      select: COST_SELECT,
    }),
    db.stop.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, timezone: true },
    }),
    db.item.findMany({
      where: { tripId },
      select: { id: true, stopId: true, category: true, date: true },
    }),
    db.accommodation.findMany({
      where: { tripId },
      select: { id: true, stopId: true, checkIn: true, checkOut: true },
    }),
    db.transport.findMany({
      where: { tripId },
      select: { id: true, fromStopId: true, toStopId: true, depAt: true },
    }),
    db.exchangeRate.findMany({
      where: { tripId },
      select: { base: true, quote: true, rate: true, manual: true, fetchedAt: true },
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

  const budgetStops: BudgetStop[] = stops.map((s) => ({
    id: s.id,
    name: s.name,
    timezone: s.timezone,
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
  const staleThresholdMs = 24 * 60 * 60 * 1000;

  const rateEntries: RateEntry[] = foreignCurrencies.map((currency) => {
    const stored = rateByBase.get(currency);
    if (!stored) {
      return { currency, rate: null, source: "none" as const, stale: false };
    }
    const source = stored.manual ? "manual" : "fetched";
    // "stale" if the rate was fetched more than 24 hours ago
    const ageMs = now.getTime() - stored.fetchedAt.getTime();
    const stale = !stored.manual && ageMs > staleThresholdMs;
    return {
      currency,
      rate: stored.rate,
      source: stale ? "stale" : source,
      stale,
    } as RateEntry;
  });

  const hasAnyCosts = allCosts.length > 0;
  const gapMinor = budget.grandTotal.actualMinor > 0
    ? budget.grandTotal.estimatedMinor - budget.grandTotal.actualMinor
    : null;

  // Per-day data — only days with non-zero costs for the compact strip
  const daysWithCosts = budget.byDay.filter(
    (d) => d.estimatedMinor > 0 || d.actualMinor > 0,
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

      {/* Grand total hero */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Estimated total
              </p>
              <p className="font-display text-4xl font-semibold tracking-tight">
                {formatMoney(budget.grandTotal.estimatedMinor, homeCurrency)}
              </p>
            </div>

            {budget.grandTotal.actualMinor > 0 && (
              <div className="flex flex-col gap-1 sm:text-right">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Spent so far
                </p>
                <p className="font-display text-2xl font-semibold">
                  {formatMoney(budget.grandTotal.actualMinor, homeCurrency)}
                </p>
                {gapMinor !== null && (
                  <div className="flex items-center gap-1 text-sm sm:justify-end">
                    {gapMinor >= 0 ? (
                      <TrendingDown className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    ) : (
                      <TrendingUp className="size-3.5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                    )}
                    <span
                      className={
                        gapMinor >= 0
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-rose-700 dark:text-rose-400"
                      }
                    >
                      {formatGap(gapMinor, homeCurrency).label}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{cat.category}</span>
                      <div className="flex items-center gap-3 tabular-nums text-right">
                        <span className="text-muted-foreground text-xs">{pct}%</span>
                        <span className="min-w-[5rem] text-right">
                          {formatMoney(cat.estimatedMinor, homeCurrency)}
                        </span>
                        {cat.actualMinor > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400 min-w-[5rem] text-right">
                            {formatMoney(cat.actualMinor, homeCurrency)}
                          </span>
                        )}
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
                  <span className="text-sm font-medium">{stop.stopName}</span>
                  <div className="flex items-center gap-4 tabular-nums text-sm text-right">
                    <span>{formatMoney(stop.estimatedMinor, homeCurrency)}</span>
                    {stop.actualMinor > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {formatMoney(stop.actualMinor, homeCurrency)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
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
                  <div className="flex items-center gap-4 tabular-nums text-sm text-right">
                    <span>{formatMoney(day.estimatedMinor, homeCurrency)}</span>
                    {day.actualMinor > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {formatMoney(day.actualMinor, homeCurrency)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
