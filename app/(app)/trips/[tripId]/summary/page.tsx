import { notFound } from "next/navigation";
import {
  MapPin,
  Calendar,
  Moon,
  Plane,
  Home,
  DollarSign,
  Flag as FlagIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { formatMoney } from "@/lib/money";
import { formatDateRange, nightsBetween } from "@/lib/dates";
import { buildBudget, applyFxRatesToCosts } from "@/lib/budget";
import { detectFlags } from "@/lib/flags";
import { groupStopsByChapter, chapterForStop } from "@/lib/chapters";
import { chapterColourSwatch } from "@/lib/chapter-colours";
import { ChapterChip } from "@/components/trip/chapter-chip";
import { CostAmounts } from "@/components/trip/cost-amounts";
import type {
  BudgetStopWithDates,
  BudgetItem,
  BudgetAccommodation,
  BudgetTransport,
} from "@/lib/budget";
import type {
  FlagStop,
  FlagTransport,
  FlagAccommodation,
  FlagItem,
} from "@/lib/flags";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FlagList } from "@/components/trip/flag-list";
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
  ownerType: true,
  ownerId: true,
  label: true,
  category: true,
} as const;

// ---------------------------------------------------------------------------
// Transport mode label helper
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<string, string> = {
  FLIGHT: "Flight",
  TRAIN: "Train",
  BUS: "Bus",
  CAR: "Car",
  FERRY: "Ferry",
  OTHER: "Transport",
};

function modeLabel(mode: string) {
  return MODE_LABELS[mode] ?? mode;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SummaryPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      homeCurrency: true,
    },
  });
  if (!trip) notFound();
  // The summary's budget, nights, and flags are all anchored to the trip
  // window; a date-less trip has nothing dated to summarise yet.
  if (!trip.startDate || !trip.endDate) {
    return (
      <EmptyState
        icon={Calendar}
        title="No dates yet"
        description="Set your trip's start and end dates to see a summary of your itinerary, budget, and flags."
      />
    );
  }

  const { homeCurrency, startDate, endDate } = trip;

  // Fetch all trip data in parallel
  const [stops, transports, accommodations, items, costs, exchangeRates, chapters, roughStops] =
    await Promise.all([
      db.stop.findMany({
        // Rough (date-less) stops are excluded from the dated summary; a later
        // task surfaces them as "not yet scheduled".
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
      db.transport.findMany({
        where: { tripId },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          mode: true,
          fromStopId: true,
          toStopId: true,
          depPlace: true,
          arrPlace: true,
          depAt: true,
          arrAt: true,
          sortOrder: true,
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
        select: { id: true, stopId: true, category: true, date: true, startTime: true, endTime: true },
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
        // Only dated chapters group the dated summary.
        where: { tripId, startDate: { not: null } },
        orderBy: { startDate: "asc" },
        select: { id: true, name: true, colour: true, startDate: true, endDate: true },
      }),
      db.stop.findMany({
        where: { tripId, arriveDate: null },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, nights: true, country: true, chapterId: true },
      }),
    ]);

  // ---------------------------------------------------------------------------
  // Apply FX rates to costs (same approach as budget page)
  // ---------------------------------------------------------------------------
  const costsWithRates = applyFxRatesToCosts({ costs, exchangeRates, homeCurrency });

  // ---------------------------------------------------------------------------
  // Build budget roll-up
  // ---------------------------------------------------------------------------
  // Cast stops to BudgetStopWithDates — the select above includes arriveDate,
  // departDate, and sortOrder, so chapter membership lookups will work and
  // budget.byChapter will be populated.
  // The stop/chapter queries filter rough (date-less) rows out, so the date
  // fields are non-null at runtime; narrow the Prisma types once here.
  const datedStops = stops.map((s) => ({
    ...s,
    arriveDate: s.arriveDate!,
    departDate: s.departDate!,
  }));
  const datedChapters = chapters.map((c) => ({
    ...c,
    startDate: c.startDate!,
    endDate: c.endDate!,
  }));

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
  // Detect flags
  // ---------------------------------------------------------------------------
  const flags = detectFlags({
    stops: stops as FlagStop[],
    transports: transports as FlagTransport[],
    accommodations: accommodations as FlagAccommodation[],
    items: items as FlagItem[],
    tripStart: startDate,
    tripEnd: endDate,
    roughStopCount: roughStops.length,
  });

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------
  const tripBasePath = `/trips/${tripId}`;
  const totalNights = nightsBetween(startDate, endDate);

  // Build lookup maps for the stops overview
  const accomByStopId = new Map<string, (typeof accommodations)[number]>();
  for (const acc of accommodations) {
    accomByStopId.set(acc.stopId, acc);
  }

  // Transport departing from each stop
  const transportFromStop = new Map<string, (typeof transports)[number]>();
  for (const t of transports) {
    if (t.fromStopId) {
      transportFromStop.set(t.fromStopId, t);
    }
  }

  // Budget by stop as a map
  const budgetByStopId = new Map<string, { estimatedMinor: number; actualMinor: number }>();
  for (const bs of budget.byStop) {
    if (bs.stopId) budgetByStopId.set(bs.stopId, bs);
  }

  // Budget by chapter as a map (for chapter subtotals in headers)
  const budgetByChapterId = new Map<string, { estimatedMinor: number; actualMinor: number }>();
  for (const bc of budget.byChapter) {
    budgetByChapterId.set(bc.chapterId, bc);
  }

  // Group stops by chapter for the itinerary section
  const stopGroups = groupStopsByChapter(datedStops, datedChapters);

  // Route map stops — resolve chapter colour hex here (server side) so the
  // client map component stays dumb and receives only a plain hex string.
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

  const warningCount = flags.filter((f) => f.severity === "warning").length;
  const infoCount = flags.filter((f) => f.severity === "info").length;

  // Grand total values
  const { grandTotal } = budget;
  const hasActual = grandTotal.actualMinor > 0;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Header stat bar ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={MapPin}
          label="Stops"
          value={String(stops.length)}
        />
        <StatCard
          icon={Moon}
          label="Nights"
          value={String(totalNights)}
        />
        <StatCard
          icon={DollarSign}
          label={hasActual ? "Actual spend" : "Est. budget"}
          value={formatMoney(
            hasActual ? grandTotal.actualMinor : grandTotal.estimatedMinor,
            homeCurrency,
          )}
        />
        <StatCard
          icon={FlagIcon}
          label="Flags"
          value={
            flags.length === 0
              ? "None"
              : `${warningCount > 0 ? `${warningCount}⚠` : ""}${warningCount > 0 && infoCount > 0 ? " " : ""}${infoCount > 0 ? `${infoCount}ℹ` : ""}`
          }
        />
      </div>

      {/* ── Not yet scheduled ── */}
      {roughStops.length > 0 && (
        <section aria-labelledby="rough-heading">
          <SectionHeading id="rough-heading" icon={MapPin} title="Not yet scheduled" />
          <div className="flex flex-col gap-3">
            {roughStops.map((stop) => {
              const nights = stop.nights ?? 1;
              const chapter = stop.chapterId
                ? chapters.find((c) => c.id === stop.chapterId)
                : undefined;
              return (
                <div
                  key={stop.id}
                  className="rounded-2xl border border-border bg-card p-5 shadow-soft"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-semibold text-foreground">
                      {stop.name}
                    </h3>
                    {stop.country && (
                      <span className="text-sm text-muted-foreground">{stop.country}</span>
                    )}
                    <span className="text-sm text-muted-foreground">
                      ~{nights} night{nights === 1 ? "" : "s"}
                    </span>
                    {chapter && (
                      <ChapterChip name={chapter.name} colour={chapter.colour} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Route Map ── */}
      <section aria-labelledby="map-heading">
        <SectionHeading id="map-heading" icon={MapPin} title="Route" />
        {/* RouteMap is client-only via dynamic import */}
        <RouteMap stops={mapStops} height={380} />
      </section>

      {/* ── Stops overview ── */}
      <section aria-labelledby="stops-heading">
        <SectionHeading id="stops-heading" icon={Calendar} title="Itinerary at a glance" />
        {stops.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stops added yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {(() => {
              // Global stop counter — preserve numbering across chapter groups
              let globalIdx = 0;
              const totalGroupedStops = stopGroups.reduce((n, g) => n + g.stops.length, 0);
              return stopGroups.map((group) => {
                const { chapter } = group;
                const chapterBudget = chapter ? budgetByChapterId.get(chapter.id) : undefined;

                return (
                  <div key={chapter?.id ?? "ungrouped"}>
                    {/* Chapter header — only when there is a chapter (or when
                        chapters exist and this group is ungrouped) */}
                    {chapter ? (
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                        <div className="flex items-center gap-2">
                          <ChapterChip name={chapter.name} colour={chapter.colour} />
                          <span className="text-xs text-muted-foreground">
                            {formatDateRange(chapter.startDate, chapter.endDate)}
                          </span>
                        </div>
                        {chapterBudget && (
                          <CostAmounts
                            estimatedMinor={chapterBudget.estimatedMinor}
                            actualMinor={chapterBudget.actualMinor}
                            currency={homeCurrency}
                            className="text-muted-foreground"
                          />
                        )}
                      </div>
                    ) : chapters.length > 0 ? (
                      <div className="mb-2 px-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Ungrouped
                        </span>
                      </div>
                    ) : null}

                    {/* Per-stop cards */}
                    <div className="flex flex-col gap-3">
                      {group.stops.map((stop) => {
                        const stopNum = ++globalIdx;
                        const nights = nightsBetween(stop.arriveDate, stop.departDate);
                        const accom = accomByStopId.get(stop.id);
                        const transport = transportFromStop.get(stop.id);
                        const stopBudget = budgetByStopId.get(stop.id);
                        const isLast = globalIdx === totalGroupedStops;

                        return (
                          <div
                            key={stop.id}
                            className="rounded-2xl border border-border bg-card p-5 shadow-soft"
                          >
                            {/* Stop name + country */}
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                                    {stopNum}
                                  </span>
                                  <h3 className="font-display text-lg font-semibold text-foreground">
                                    {stop.name}
                                  </h3>
                                  {stop.country && (
                                    <span className="text-sm text-muted-foreground">
                                      {stop.country}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                  {formatDateRange(stop.arriveDate, stop.departDate)}
                                  {" · "}
                                  {nights === 0
                                    ? "Same-day"
                                    : `${nights} night${nights === 1 ? "" : "s"}`}
                                </p>
                              </div>
                              {stopBudget && (
                                <div className="text-right">
                                  <p className="font-mono text-sm font-semibold text-foreground">
                                    {formatMoney(
                                      stopBudget.actualMinor > 0
                                        ? stopBudget.actualMinor
                                        : stopBudget.estimatedMinor,
                                      homeCurrency,
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {stopBudget.actualMinor > 0 ? "actual" : "est."}
                                    {nights > 0 &&
                                      stopBudget.estimatedMinor > 0 &&
                                      ` · ${formatMoney(
                                        Math.round(stopBudget.estimatedMinor / nights),
                                        homeCurrency,
                                      )}/night`}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Accommodation */}
                            {accom && (
                              <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                                <Home className="size-3.5 shrink-0" aria-hidden="true" />
                                <span>{accom.name}</span>
                                <span className="text-xs opacity-60">
                                  {accom.checkIn} – {accom.checkOut}
                                </span>
                              </div>
                            )}

                            {/* Outbound transport */}
                            {transport && !isLast && (
                              <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                                <Plane className="size-3.5 shrink-0" aria-hidden="true" />
                                <span>
                                  {modeLabel(transport.mode)}
                                  {transport.depPlace ? ` from ${transport.depPlace}` : ""}
                                  {transport.arrPlace ? ` → ${transport.arrPlace}` : ""}
                                </span>
                                {transport.depAt && (
                                  <Badge variant="outline" className="ml-auto text-xs font-mono">
                                    {new Date(transport.depAt).toLocaleDateString("en-AU", {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </section>

      {/* ── Budget summary ── */}
      <section aria-labelledby="budget-heading">
        <SectionHeading id="budget-heading" icon={DollarSign} title="Budget summary" />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Total trip cost
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6">
            <Stat
              label="Estimated"
              value={formatMoney(grandTotal.estimatedMinor, homeCurrency)}
            />
            {grandTotal.actualMinor > 0 && (
              <Stat
                label="Actual"
                value={formatMoney(grandTotal.actualMinor, homeCurrency)}
              />
            )}
            {budget.hasMissingRates && (
              <p className="w-full text-xs text-amber-600">
                ⚠ Some costs in {budget.missingRates.join(", ")} are excluded
                (no FX rate available).
              </p>
            )}
            {/* Category breakdown */}
            {budget.byCategory.length > 0 && (
              <div className="w-full">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  By category
                </p>
                <div className="flex flex-col gap-1">
                  {budget.byCategory.map((bc) => (
                    <div
                      key={bc.category}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">{bc.category}</span>
                      <span className="font-mono font-medium">
                        {formatMoney(bc.estimatedMinor, homeCurrency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Flags ── */}
      <section aria-labelledby="flags-heading">
        <SectionHeading id="flags-heading" icon={FlagIcon} title="Trip health" />
        <FlagList flags={flags} tripBasePath={tripBasePath} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small layout sub-components (server-only, no separate file needed)
// ---------------------------------------------------------------------------

function SectionHeading({
  id,
  icon: Icon,
  title,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="size-4 text-primary" aria-hidden="true" />
      <h2 id={id} className="font-display text-lg font-semibold text-foreground">
        {title}
      </h2>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </div>
      <p className="font-mono text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
