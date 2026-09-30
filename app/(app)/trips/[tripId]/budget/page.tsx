import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { readTripShell } from "@/lib/trip-shell-reads";
import { tripPath } from "@/lib/trip-path";
import { planScope, resolvePlan } from "@/lib/plan-scope";
import { chapterForStop } from "@/lib/chapters";
import { VariantBanner } from "@/components/trip/variant-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { buildBudget } from "@/lib/budget";
import { isRateStale } from "@/lib/fx";
import type { RateEntry } from "@/components/trip/rates-panel";
import type { BudgetCost, BudgetStopWithDates, BudgetItem, BudgetAccommodation, BudgetTransport } from "@/lib/budget";
import { buildSpendSoFar } from "@/lib/spend-so-far";
import type { SpendCost } from "@/lib/spend-so-far";
import { nightsBetween } from "@/lib/dates";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
import { buildCostLabelMap } from "@/lib/cost-labels";
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
// Data fetching
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Layout constants (exported for unit tests) — MONEY.md §7
// ---------------------------------------------------------------------------

// 4.5rem = the trip layout's pt-6 + the content wrapper's py-6 at md+. Below
// 760px tall the fixed height drops so nothing is clipped; the page scrolls.
export const MONEY_PAGE_CLASS = "flex flex-col gap-3.5 md:gap-5 lg:[@media(min-height:760px)]:h-[calc(100dvh-4.5rem)]";
const GRID_BASE = "grid grid-cols-1 gap-3.5 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:gap-[18px]";
export const MONEY_DESKTOP_GRID_CLASS = `${GRID_BASE} lg:grid-rows-[268px_minmax(0,1fr)]`;
/** A fork's Cost tile has no paid bar, so its row sizes to the tile. */
export const MONEY_DESKTOP_GRID_FORK_CLASS = `${GRID_BASE} lg:grid-rows-[auto_minmax(0,1fr)]`;
const SPAN = {
  tile: "lg:col-span-8 lg:row-start-1",
  right: "flex min-h-0 flex-col gap-3.5 lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1 lg:gap-[18px]",
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
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { homeCurrency: true, startDate: true, endDate: true, chaptersEnabled: true, forksEnabled: true },
  });
  if (!trip) notFound();

  // Plan variants off (spec B3) → `?plan=` is ignored and this is the real plan.
  // Otherwise validate the fork exists for this trip; fall back to real plan if not.
  const selectedForkId = resolvePlan({ plan, forksEnabled: trip.forksEnabled });
  const activeFork = selectedForkId
    ? await db.fork.findFirst({ where: { id: selectedForkId, tripId }, select: { id: true, name: true } })
    : null;
  const activeForkId = activeFork ? activeFork.id : null;

  const [shell, slug] = await Promise.all([readTripShell(tripId), tripSlugFor(tripId)]);
  const members = shell?.members.map((m) => m.user) ?? [];

  // Cost creation writes to the real plan (createCost carries no fork
  // context), so a variant gets no + Add a cost rather than misfiled data.
  const header = (meta: string) => (
    <MoneyHeader
      tripId={tripId}
      slug={slug}
      tripName={shell?.name ?? ""}
      meta={meta}
      members={members}
      homeCurrency={trip.homeCurrency}
      showAddCost={!activeFork}
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

  // Fetch everything in parallel
  const [allCosts, stops, items, accommodations, transports, exchangeRates, chapters] = await Promise.all([
    db.cost.findMany({
      where: { tripId, ...planScope(activeForkId) },
      orderBy: { createdAt: "asc" },
      select: COST_SELECT,
    }),
    db.stop.findMany({
      // Rough (date-less) stops carry no costs onto the dated budget.
      where: { tripId, ...planScope(activeForkId), arriveDate: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true },
    }),
    db.item.findMany({
      where: { tripId, ...planScope(activeForkId) },
      select: { id: true, stopId: true, category: true, date: true, title: true },
    }),
    db.accommodation.findMany({
      where: { tripId, ...planScope(activeForkId) },
      select: { id: true, stopId: true, checkIn: true, checkOut: true, name: true },
    }),
    db.transport.findMany({
      where: { tripId, ...planScope(activeForkId) },
      select: { id: true, fromStopId: true, toStopId: true, depAt: true, mode: true },
    }),
    db.exchangeRate.findMany({
      // Exchange rates are trip-wide, not plan-scoped (CONTEXT.md).
      where: { tripId },
      select: { base: true, quote: true, rate: true, manual: true, fetchedAt: true },
    }),
    db.chapter.findMany({
      // Rough (date-less) chapters have no dated window, so buildBudget would
      // emit a blank $0 row for each — match the summary page and exclude them.
      where: { tripId, ...planScope(activeForkId), startDate: { not: null } },
      orderBy: { startDate: "asc" },
      select: { id: true, name: true, colour: true, startDate: true, endDate: true },
    }),
  ]);

  const stopName = new Map(stops.map((s) => [s.id, s.name] as const));

  // Owner-label map (lib/cost-labels.ts): the budget page has no free-text
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

  // Build budget input
  const budgetCosts: BudgetCost[] = allCosts.map((c) => ({
    id: c.id,
    costMinor: c.costMinor,
    paidMinor: c.paidMinor,
    paidAt: c.paidAt,
    currency: c.currency,
    rateToHome: c.rateToHome,
    ownerType: c.ownerType as BudgetCost["ownerType"],
    ownerId: c.ownerId,
    label: c.label,
    category: c.category,
    settlement: c.settlement,
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
    // A disabled trip renders as if it had no chapters — data stays, the
    // per-chapter roll-up just doesn't build (Task 13).
    chapters: chaptersEnabled ? chapters : [],
  });

  // Build SpendCost[] — same as budgetCosts but with paidAt from allCosts
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
        {header(meta)}
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
            {!activeFork && <AddCostButton tripId={tripId} homeCurrency={homeCurrency} variant="pill" />}
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
  const toPayInputs = allCosts.map((c) => ({ ...c, displayLabel: c.label ?? ownerName.get(c.ownerId ?? "") ?? "Cost" }));
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
      {header(meta)}
      {banner}
      <div className={activeFork ? MONEY_DESKTOP_GRID_FORK_CLASS : MONEY_DESKTOP_GRID_CLASS} data-testid="money-grid">
        <CostTile
          className={hasRight ? SPAN.tile : SPAN.full}
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
                className="lg:min-h-0 lg:flex-1"
                tripId={tripId}
                homeCurrency={homeCurrency}
                today={today}
                costs={toPayInputs}
                costRows={allCosts}
                ratesFooter={ratesStrip}
              />
            ) : null}
            {ratesStrip ? <div className={cn("lg:flex-none", showToPay && "hidden md:block")}>{ratesStrip}</div> : null}
          </div>
        ) : null}
        <BreakdownCard
          className={hasRight ? SPAN.where : SPAN.full}
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
