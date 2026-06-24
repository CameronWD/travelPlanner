import { db } from "@/lib/db";
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
import { chapterForStop } from "@/lib/chapters";
import { chapterColourSwatch } from "@/lib/chapter-colours";
import { CountdownHero } from "@/components/trip/home/countdown-hero";
import { NextStepsCard } from "@/components/trip/home/next-steps-card";
import { BudgetGlance } from "@/components/trip/home/budget-glance";
import { QuickActions } from "@/components/trip/home/quick-actions";
import { RouteMapLoader as RouteMap } from "@/components/trip/route-map-loader";
import type { RouteMapStop } from "@/components/trip/route-map";

const COST_SELECT = {
  id: true,
  estimatedMinor: true,
  actualMinor: true,
  currency: true,
  rateToHome: true,
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
  };
  today: string;
  phase: TripPhase; // "planning" | "final-prep"
}

export async function PhasePlanning({
  tripId,
  trip,
  today,
  phase,
}: PhasePlanningProps) {
  // This phase only renders for dated trips; bail safely if called otherwise.
  if (!trip.startDate) return null;

  const base = `/trips/${tripId}`;
  const startDate = trip.startDate!;
  const endDate = trip.endDate ?? startDate;
  const homeCurrency = trip.homeCurrency;

  const [
    datedStopsRaw,
    roughStops,
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
      where: { tripId, arriveDate: { not: null } },
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
    db.stop.count({ where: { tripId, arriveDate: null } }),
    db.transport.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
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
        lat: true,
        lng: true,
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
    db.chapter.count({ where: { tripId, startDate: null } }),
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
  // Detect flags (mirrors summary/page.tsx)
  // ---------------------------------------------------------------------------
  const flagStops: FlagStop[] = datedStops.map((s) => ({ ...s, timezone: s.timezone ?? "UTC" }));
  const flags = detectFlags({
    stops: flagStops,
    transports: transports as FlagTransport[],
    accommodations: accommodations as FlagAccommodation[],
    items: items as FlagItem[],
    tripStart: startDate,
    tripEnd: endDate,
    roughStopCount: roughStops,
  });

  // ---------------------------------------------------------------------------
  // Build next steps
  // ---------------------------------------------------------------------------
  const steps = buildNextSteps({
    flags,
    phase,
    nudges: {
      hasDates: true, // we only render PhasePlanning when dates exist
      undatedChapterCount,
      hasPackingList: packingCount > 0,
      hasPretripList: pretripCount > 0,
      unbookedTransportCount: transports.filter((t) => !t.depAt).length,
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
      estimatedMinor={budget.grandTotal.estimatedMinor}
      actualMinor={budget.grandTotal.actualMinor}
      homeCurrency={homeCurrency}
      href={`${base}/budget`}
    />
  );

  const route =
    mapStops.length > 0 ? (
      <section
        key="route"
        className="rounded-2xl border border-border bg-card p-2 shadow-soft"
      >
        <RouteMap stops={mapStops} height={280} />
      </section>
    ) : null;

  // final-prep leads with action cards; planning leads with plan-oriented cards
  const order =
    phase === "final-prep"
      ? [hero, nextSteps, actions, money, route]
      : [hero, nextSteps, money, route, actions];

  return <div className="flex flex-col gap-6">{order}</div>;
}
