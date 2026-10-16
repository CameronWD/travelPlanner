import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { requireTripAccess } from "@/lib/guards";
import { readPlan, resolvePlanParam } from "@/lib/plan-reads";
import { tripPath } from "@/lib/trip-path";
import { chapterForStop } from "@/lib/chapters";
import { VariantBanner } from "@/components/trip/variant-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { buildBudgetFromRows } from "@/lib/money/budget-loader";
import { isRateStale } from "@/lib/money/fx";
import type { RateEntry } from "@/components/trip/rates-panel";
import type { BudgetStopWithDates } from "@/lib/money/budget";
import { buildSpendSoFar } from "@/lib/money/spend-so-far";
import type { SpendCost } from "@/lib/money/spend-so-far";
import { nightsBetween } from "@/lib/dates";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
import { computeTripPhase } from "@/lib/trip-phase";
import { otherCostDefaults, type OtherCostDefaults } from "@/lib/money/other-cost-defaults";
import { buildCostLabelMap } from "@/lib/money/cost-labels";
import { cn } from "@/lib/cn";
import { moneyMetaLine, missingRatesLine, ratesUpdatedNote } from "@/lib/money/summary-lines";
import { breakdownOptions, parseBy, rowsFor, segmentsFor } from "@/lib/money/breakdown";
import { MoneyHeader } from "@/components/money/money-header";
import { AddCostButton } from "@/components/money/add-cost-button";
import { CostTile } from "@/components/money/cost-tile";
import { ToPayCard } from "@/components/money/to-pay-card";
import { BreakdownCard } from "@/components/money/breakdown-card";
import { RatesStrip } from "@/components/money/rates-strip";

export const metadata: Metadata = { title: "Money" };

// ---------------------------------------------------------------------------
// Layout constants (exported for unit tests) — MONEY.md §7
// ---------------------------------------------------------------------------

// Ruling R2 (spec 2026-10-12 W10): the page scrolls; no viewport pin, no
// fixed first row — the tile sizes to itself (its settlement box may wrap
// under the amount) and Where it goes grows to every category.
export const MONEY_PAGE_CLASS = "flex flex-col gap-3.5 md:gap-5";
const GRID_BASE = "grid grid-cols-1 gap-3.5 lg:grid-cols-12 lg:gap-[18px]";
export const MONEY_DESKTOP_GRID_CLASS = `${GRID_BASE} lg:grid-rows-[auto_auto]`;
/** Kept as an alias: a fork's tile sizes itself like every other row now. */
export const MONEY_DESKTOP_GRID_FORK_CLASS = MONEY_DESKTOP_GRID_CLASS;
const SPAN = {
  tile: "lg:col-span-8 lg:row-start-1",
  right: "flex flex-col gap-3.5 lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1 lg:gap-[18px]",
  where: "lg:col-span-8 lg:row-start-2",
  full: "lg:col-span-12",
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ plan?: string | string[]; by?: string | string[] }>;
}) {
  const { tripId } = await params;
  const { plan, by: rawBy } = await searchParams;
  const { user } = await requireTripAccess(tripId);

  // One fork gate (lib/plan-reads.ts): Plan variants off (spec B3) or a Fork
  // that isn't this Trip's → the real plan. Then every Plan row in one read,
  // the viewer's Surprises applied (ADR 0072).
  const { plan: activeForkId, fork: activeFork } = await resolvePlanParam(tripId, plan);
  const planRows = await readPlan(tripId, user.id, activeForkId);
  const trip = planRows.trip;
  const slug = trip.slug ?? tripId;
  const members = trip.members.map((m) => m.user);

  // Cost creation writes to the real plan (createCost carries no fork
  // context), so a variant gets no + Add a cost rather than misfiled data.
  const header = (meta: string, costDefaults?: OtherCostDefaults) => (
    <MoneyHeader
      tripId={tripId}
      slug={slug}
      tripName={trip.name}
      meta={meta}
      members={members}
      homeCurrency={trip.homeCurrency}
      showAddCost={!activeFork}
      costDefaults={costDefaults}
    />
  );
  const banner = activeFork ? <VariantBanner tripId={tripId} variantName={activeFork.name} /> : null;

  // The budget roll-up enumerates every trip day; a date-less trip has no
  // dated window to spread costs across yet.
  if (!trip.startDate || !trip.endDate) {
    return (
      <div className="flex flex-col gap-5">
        {header(`In ${trip.homeCurrency}`)}
        {banner}
        <EmptyState
          icon={Wallet}
          tone="teal"
          title="No dates yet"
          description="Set your trip's start and end dates to see where the money goes."
          action={
            <Button asChild>
              <Link href={tripPath(slug, "/settings")}>Set dates</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { homeCurrency, startDate, endDate, chaptersEnabled } = trip;

  // Surprise (ADR 0051): hidden Costs stay in the totals but fold into one
  // "Surprise" byCategory row (buildBudgetFromRows below); this page renders
  // no Cost lines until the "lines" (toPayInputs/costRows) below drop them.
  const v = planRows.visibility;

  // Costs are unfiltered (hidden ones stay in the totals). Rough (date-less)
  // stops carry no costs onto the dated budget, and rough chapters have no
  // dated window (buildBudget would emit a blank $0 row for each — match the
  // summary page and exclude them). Exchange rates are trip-wide (CONTEXT.md).
  const allCosts = planRows.costs;
  const stops = planRows.stops.filter((s) => s.arriveDate);
  const chapters = planRows.chapters.filter((c) => c.startDate);
  const { transports, exchangeRates } = planRows;
  // Unfiltered and minimal: buildBudget places a hidden owner's Cost by its
  // real stop/date, and the owner labels below cover Wishlist ideas too.
  const items = planRows.budgetItems;
  const accommodations = planRows.budgetAccommodations;

  const stopName = new Map(stops.map((s) => [s.id, s.name] as const));

  // Owner-label map (lib/money/cost-labels.ts): the budget page has no free-text
  // depPlace/arrPlace to fall back on for transports, so it resolves both
  // endpoints via the stop-name map — same as before this was extracted.
  const ownerName = buildCostLabelMap({
    items: items.map((i) => ({ id: i.id, title: i.title })),
    accommodations: accommodations.map((a) => ({ id: a.id, name: a.name })),
    transports: transports.map((t) => ({
      id: t.id,
      mode: t.mode,
      depPlace: t.fromStopId ? (stopName.get(t.fromStopId) ?? null) : null,
      arrPlace: t.toStopId ? (stopName.get(t.toStopId) ?? null) : null,
    })),
  });

  // Non-null at runtime: rough (date-less) stops are filtered out above.
  // Still assembled here (not just inside buildBudgetFromRows) —
  // stopChapterColour below reuses it for the breakdown rows.
  const budgetStops: BudgetStopWithDates[] = stops.map((s) => ({
    id: s.id,
    name: s.name,
    timezone: s.timezone,
    arriveDate: s.arriveDate!,
    departDate: s.departDate!,
    sortOrder: s.sortOrder,
  }));

  // The roll-up itself: lib/money/budget-loader.ts's `buildBudgetFromRows` is the
  // same input-assembly + buildBudget() call `get_budget`'s loadBudget uses,
  // run here against the Plan rows read above (no new queries —
  // allCosts/items/accommodations/transports/chapters are all reused for
  // ownerName, the Rates strip, etc. too).
  const budget = buildBudgetFromRows({
    homeCurrency,
    costs: allCosts,
    stops: budgetStops,
    items,
    accommodations,
    transports,
    tripStart: startDate,
    tripEnd: endDate,
    // A disabled trip renders as if it had no chapters — data stays, the
    // per-chapter roll-up just doesn't build (Task 13).
    chapters: chaptersEnabled ? chapters : [],
    homeTimezone: trip.homeTimezone,
    surpriseOwnerIds: v.hiddenOwnerIds,
  });

  // Build SpendCost[] — same shape as a budget cost but with paidAt from allCosts
  const spendCosts: SpendCost[] = allCosts.map((c) => ({
    id: c.id,
    costMinor: c.costMinor,
    paidMinor: c.paidMinor,
    currency: c.currency,
    rateToHome: c.rateToHome,
    ownerType: c.ownerType as SpendCost["ownerType"],
    ownerId: c.ownerId,
    label: c.label,
    category: c.category,
    paidAt: c.paidAt,
  }));

  const today = todayISOInZone(currentTripTimezone(stops));
  const costDefaults = otherCostDefaults({ phase: computeTripPhase({ startDate, endDate, today }), homeCurrency, today, stops });

  const spend = buildSpendSoFar({
    costs: spendCosts,
    homeCurrency,
    tripStart: startDate,
    tripEnd: endDate,
    today,
  });

  // Distinct foreign currencies from all costs, for the Rates strip
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

  // Days with any cost — gates the Day grouping
  const daysWithCosts = budget.byDay.filter(
    (d) => d.costTotalMinor > 0 || d.paidTotalMinor > 0,
  );

  // Build per-row missing-rate indicators: which categories have costs whose
  // currency has no exchange rate? They carry a No rate chip in Where it goes.
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


  const nights = nightsBetween(startDate, endDate);
  const currencyCount = new Set([homeCurrency.toUpperCase(), ...allCosts.map((c) => c.currency.toUpperCase())]).size;
  const meta = moneyMetaLine({ homeCurrency, nights, costCount: allCosts.length, currencyCount });

  if (allCosts.length === 0) {
    return (
      <div className={MONEY_PAGE_CLASS}>
        {header(meta, costDefaults)}
        {banner}
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12 lg:gap-[18px]">
          <section
            aria-labelledby="nothing-costed"
            className="flex flex-col items-start gap-3 rounded-xl border-2 border-border bg-coral p-6 text-on-accent shadow-hard-3 lg:col-span-8"
          >
            <h2 id="nothing-costed" className="font-display text-[28px] font-extrabold tracking-[-0.02em]">
              Nothing costed yet
            </h2>
            <p className="max-w-[46ch] text-[15px] font-semibold">
              Costs show up here as you add flights, stays and things to do.
            </p>
            {!activeFork && <AddCostButton tripId={tripId} homeCurrency={homeCurrency} variant="pill" defaults={costDefaults} />}
          </section>
          <div className="grid min-h-32 place-items-center rounded-xl border-2 border-dashed border-border-soft p-6 text-center text-[15px] font-semibold text-muted-foreground lg:col-span-4">
            Due dates will line up here
          </div>
        </div>
      </div>
    );
  }

  const options = breakdownOptions({ chapters: chaptersEnabled && budget.byChapter.length > 0, days: daysWithCosts.length > 0 });
  const by = parseBy(rawBy, options.map((o) => o.value));
  const stopChapterColour = new Map(
    chaptersEnabled
      ? budgetStops.flatMap((s) => {
          const ch = chapterForStop(s, chapters);
          return ch ? [[s.id, ch.colour] as const] : [];
        })
      : [],
  );
  const rows = rowsFor(budget, by, { stopChapterColour, missingRateCategories: categoriesWithMissingRates });
  const segments = by === "day" ? [] : segmentsFor(rows, budget.grandTotal.costTotalMinor);
  // Surprise (ADR 0051): the lines list drops costs folded into the
  // "Surprise" byCategory row — the money stays in every total above, only
  // the individual lines (and their owner's title/date) are hidden.
  const surpriseCostIds = new Set(budget.surpriseCostIds);
  const visibleCosts = allCosts.filter((c) => !surpriseCostIds.has(c.id));
  const toPayInputs = visibleCosts.map((c) => ({ ...c, displayLabel: c.label ?? ownerName.get(c.ownerId ?? "") ?? "Cost" }));
  const ratesNote = ratesUpdatedNote(
    foreignCurrencies.flatMap((c) => {
      const r = rateByBase.get(c);
      return r ? [{ manual: r.manual, fetchedAt: r.fetchedAt }] : [];
    }),
    now,
  );
  const missingLine = budget.hasMissingRates ? missingRatesLine(allCosts, budget.missingRates) : null;
  const ratesStrip =
    foreignCurrencies.length > 0 ? (
      <RatesStrip tripId={tripId} homeCurrency={homeCurrency} rates={rateEntries} note={ratesNote} missingLine={missingLine} />
    ) : null;
  // Paid tracking is real-plan-only, so a variant has no To pay.
  const showToPay = !activeFork;
  const hasRight = showToPay || ratesStrip != null;

  // DOM order is the phone order (MONEY.md §8): Cost tile, To pay, Where it
  // goes. With To pay present the phone's Rates strip lives in its All costs
  // sheet footer instead (§6).
  return (
    <div className={MONEY_PAGE_CLASS}>
      {header(meta, costDefaults)}
      {banner}
      <div className={activeFork ? MONEY_DESKTOP_GRID_FORK_CLASS : MONEY_DESKTOP_GRID_CLASS} data-testid="money-grid">
        <CostTile
          className={cn(hasRight ? SPAN.tile : SPAN.full, "tp-rise-in")}
          style={{ animationDelay: "0ms" }}
          tripId={tripId}
          homeCurrency={homeCurrency}
          totals={budget.grandTotal}
          paidSoFarMinor={spend.paidSoFarMinor}
          nights={nights}
          memberCount={members.length}
          showPaid={!activeFork}
        />
        {hasRight ? (
          <div className={SPAN.right}>
            {showToPay ? (
              <ToPayCard
                className="tp-rise-in"
                style={{ animationDelay: "60ms" }}
                tripId={tripId}
                homeCurrency={homeCurrency}
                today={today}
                costs={toPayInputs}
                costRows={visibleCosts}
                ratesFooter={ratesStrip}
              />
            ) : null}
            {ratesStrip ? (
              <div className={cn("lg:flex-none", showToPay && "hidden md:block")}>
                <RatesStrip
                  className="tp-rise-in"
                  style={{ animationDelay: "180ms" }}
                  tripId={tripId}
                  homeCurrency={homeCurrency}
                  rates={rateEntries}
                  note={ratesNote}
                  missingLine={missingLine}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        <BreakdownCard
          className={cn(hasRight ? SPAN.where : SPAN.full, "tp-rise-in")}
          style={{ animationDelay: "120ms" }}
          by={by}
          options={options}
          rows={rows}
          segments={segments}
          homeCurrency={homeCurrency}
          showPaid={!activeFork}
        />
      </div>
    </div>
  );
}
