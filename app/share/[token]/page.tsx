import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Home, Route as RouteIcon } from "lucide-react";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import type { ShareScope } from "@/lib/share-view";
import { tonightsStay } from "@/lib/share-view";
import { formatDateRange, formatDayLabel, formatLongDate, nightsBetween } from "@/lib/dates";
import { buildItinerary } from "@/lib/itinerary";
import { RouteMapLoader as RouteMap } from "@/components/trip/route-map-loader";
import { Logo } from "@/components/ui/logo";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Timeline } from "@/components/trip/timeline";
import { cn } from "@/lib/cn";
import type { RouteMapStop } from "@/components/trip/route-map";
import type { TransportMode } from "@/lib/enums";
import { homeMapPoint } from "@/lib/route-map";
import { orderPlanStops } from "@/lib/plan-order";
import { describePhase } from "@/lib/trip-phase";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
import { ShareTodayCard } from "./share-today-card";

// ---------------------------------------------------------------------------
// Metadata — noindex so search engines don't index private trips
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Shared itinerary",
  robots: { index: false, follow: false },
};

// ---------------------------------------------------------------------------
// Transport mode labels
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
// Page — NO AUTH. Public read-only view via share token.
// Deliberately excludes: costs, budget, notes, confirmations.
// ---------------------------------------------------------------------------

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Resolve the token → trip. Invalid/revoked tokens show notFound.
  const shareLink = await db.shareLink.findUnique({
    where: { token },
    select: {
      includeAccommodation: true,
      includeTransport: true,
      includeDailyPlans: true,
      trip: {
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          homeName: true,
          homeLat: true,
          homeLng: true,
          roundTrip: true,
          // homeCurrency intentionally omitted — no money on public page
        },
      },
    },
  });

  if (!shareLink) notFound();

  const trip = shareLink.trip;
  const tripId = trip.id;
  // The public itinerary is a dated day-by-day projection; a date-less trip
  // has nothing dated to share yet.
  if (!trip.startDate || !trip.endDate) notFound();

  const scope: ShareScope = {
    includeAccommodation: shareLink.includeAccommodation,
    includeTransport: shareLink.includeTransport,
    includeDailyPlans: shareLink.includeDailyPlans,
  };

  // Policy (not a BND-2 spelling exemption): this dated view deliberately
  // always shows the real plan and ignores `?plan=` — see
  // architecture-sitrep-2026-09-22.md. Never wire in a variable plan here.

  // Fetch itinerary data — NO costs, no notes, no confirmations. An off dial
  // means the corresponding query never runs: hidden data never leaves the
  // database, so no rendering bug can leak it.
  const rawStops = await db.stop.findMany({
    // Rough (date-less) stops aren't part of the dated public itinerary.
    where: { tripId, ...REAL_PLAN, arriveDate: { not: null } },
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
      // notes intentionally omitted
    },
  });

  const transports = scope.includeTransport
    ? await db.transport.findMany({
        where: { tripId, ...REAL_PLAN },
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
          // reference (booking number) and notes intentionally omitted — private
          sortOrder: true,
        },
      })
    : [];

  const accommodations = scope.includeAccommodation
    ? await db.accommodation.findMany({
        where: { tripId, ...REAL_PLAN },
        orderBy: { checkIn: "asc" },
        select: {
          id: true,
          stopId: true,
          name: true,
          address: true,
          checkIn: true,
          checkOut: true,
          checkInTime: true,
          checkOutTime: true,
          // confirmation intentionally omitted (private booking ref)
          // notes intentionally omitted
        },
      })
    : [];

  const items = scope.includeDailyPlans
    ? await db.item.findMany({
        where: { tripId, ...REAL_PLAN },
        orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          title: true,
          category: true,
          date: true,
          startTime: true,
          endTime: true,
          stopId: true,
          address: true,
          // link, booking, notes intentionally omitted
        },
      })
    : [];

  // Non-null at runtime: the query filters rough (date-less) stops out.
  // ADR 0038: a scheduled stop's position IS its dates — re-sort canonically
  // before rendering (the numbered "at a glance" list and the route map both
  // read this array's order), since the fetch's orderBy stays sortOrder.
  const stops = orderPlanStops(
    rawStops.map((s) => ({
      ...s,
      timezone: s.timezone ?? "UTC",
      arriveDate: s.arriveDate!,
      departDate: s.departDate!,
    })),
  );

  // Build itinerary projection (dates + entries only)
  const itinerary = buildItinerary({
    startDate: trip.startDate,
    endDate: trip.endDate,
    stops: stops.map((s) => ({
      id: s.id,
      name: s.name,
      country: s.country,
      timezone: s.timezone,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
      sortOrder: s.sortOrder,
    })),
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      stopId: item.stopId,
      address: item.address,
    })),
    transports: transports.map((t) => ({
      id: t.id,
      mode: t.mode as TransportMode,
      fromStopId: t.fromStopId,
      toStopId: t.toStopId,
      depPlace: t.depPlace,
      arrPlace: t.arrPlace,
      depAt: t.depAt,
      arrAt: t.arrAt,
    })),
    accommodations: accommodations.map((a) => ({
      id: a.id,
      stopId: a.stopId,
      name: a.name,
      address: a.address,
      checkIn: a.checkIn,
      checkOut: a.checkOut,
      checkInTime: a.checkInTime,
      checkOutTime: a.checkOutTime,
    })),
  });

  const totalNights = nightsBetween(trip.startDate, trip.endDate);

  // Phase: which stage of its life the trip is in (ADR 0010), from the
  // trip's own reference timezone — the public page has no visitor clock.
  const timeZone = currentTripTimezone(stops);
  const todayISO = todayISOInZone(timeZone);
  const phaseDesc = describePhase({
    startDate: trip.startDate,
    endDate: trip.endDate,
    today: todayISO,
  });
  const phase = phaseDesc.phase;

  // DayPlan's stop is the itinerary projection's ItineraryStop shape, which
  // carries no lat/lng — resolve today's stop from the `stops` array (which
  // does) by id instead.
  const todayPlan =
    phase === "travelling"
      ? (itinerary.find((d) => d.dateISO === todayISO) ?? null)
      : null;
  const todayStop = todayPlan?.stop
    ? (stops.find((s) => s.id === todayPlan.stop!.id) ?? null)
    : null;
  const stay = phase === "travelling" ? tonightsStay(accommodations, todayISO) : null;

  // Build per-stop lookups
  const accomByStopId = new Map<string, (typeof accommodations)[number]>();
  for (const acc of accommodations) {
    if (!accomByStopId.has(acc.stopId)) {
      accomByStopId.set(acc.stopId, acc);
    }
  }

  const transportFromStop = new Map<string, (typeof transports)[number]>();
  for (const t of transports) {
    if (t.fromStopId && !transportFromStop.has(t.fromStopId)) {
      transportFromStop.set(t.fromStopId, t);
    }
  }

  // Route map stops
  const mapStops: RouteMapStop[] = stops.map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    arriveDate: s.arriveDate,
    departDate: s.departDate,
  }));

  const stayingNights = (n: number) => (n === 0 ? "same day" : `${n}n`);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-3.5 px-4 pb-5 pt-4 sm:px-6 lg:gap-5 lg:px-12 lg:pt-7">
        {/* ── Header: kit SharePage top row (Logo 22 / 28) ── */}
        <header className="flex items-center justify-between">
          <Logo size={22} className="lg:hidden" />
          <Logo size={28} className="hidden lg:inline-flex" />
        </header>

        <main className="flex flex-col gap-3.5 lg:gap-5">
          {/* ── Hero: kit coral Card, shadow 4, radius xl ── */}
          <Card
            data-slot="share-hero"
            tone="coral"
            shadow={4}
            radius="xl"
            className="p-5 lg:p-8"
          >
            <Badge caps>Shared trip · view only</Badge>
            <h1 className="mt-[18px] break-words font-display text-[40px] font-extrabold leading-[0.95] tracking-[-0.05em] lg:mt-7 lg:text-[72px]">
              {trip.name}
            </h1>
            <p className="mt-2.5 text-base font-medium lg:text-lg">
              {formatDateRange(trip.startDate, trip.endDate)} · {totalNights} night
              {totalNights !== 1 ? "s" : ""} · {stops.length} stop{stops.length !== 1 ? "s" : ""}
            </p>
            {phase !== "travelling" && (
              <p className="mt-3.5 text-sm font-bold">{phaseDesc.countdown}</p>
            )}
          </Card>

          {/* ── Today card ── */}
          {phase === "travelling" && (
            <ShareTodayCard
              countdown={phaseDesc.countdown}
              timeZone={timeZone}
              todayISO={todayISO}
              stop={
                todayStop
                  ? { name: todayStop.name, country: todayStop.country, lat: todayStop.lat, lng: todayStop.lng }
                  : null
              }
              day={todayPlan}
              stay={stay ? { name: stay.name, address: stay.address } : null}
              scope={scope}
            />
          )}

          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.3fr_1fr] lg:gap-5">
            {/* ── The route: kit stop list (dot · connector · name · dates · outbound chip) ── */}
            <Card data-slot="share-route" className="min-w-0 p-4 lg:p-[22px]">
              <h2 id="route-heading" className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em]">
                The route
              </h2>
              {stops.length === 0 ? (
                <EmptyState
                  icon={RouteIcon}
                  tone="teal"
                  title="No stops yet"
                  description="The route shows here once the trip has dated stops."
                  className="mt-3"
                />
              ) : (
                <ol className="mt-3 flex flex-col">
                  {stops.map((stop, idx) => {
                    const nights = nightsBetween(stop.arriveDate, stop.departDate);
                    const accom = accomByStopId.get(stop.id);
                    const transport = transportFromStop.get(stop.id);
                    const isLast = idx === stops.length - 1;
                    const places = [transport?.depPlace, transport?.arrPlace].filter(Boolean).join(" → ");

                    return (
                      <li key={stop.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                        <div className="flex flex-col items-center" aria-hidden="true">
                          <span className="size-[22px] shrink-0 rounded-full border-2 border-border bg-teal" />
                          {!isLast && <span className="min-h-7 w-0.5 flex-1 bg-border" />}
                        </div>
                        <div className="min-w-0 pb-3.5">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <h3 className="min-w-0 break-words font-display text-base font-extrabold leading-snug tracking-[-0.02em]">
                              {stop.name}
                            </h3>
                            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                              {formatDayLabel(stop.arriveDate)} · {stayingNights(nights)}
                            </span>
                          </div>
                          {stop.country && (
                            <p className="text-xs font-medium text-muted-foreground">{stop.country}</p>
                          )}
                          {/* Accommodation name (no confirmation ref — that's private) */}
                          {accom && (
                            <div className="mt-1 flex min-w-0 items-start gap-1.5 text-xs font-medium text-muted-foreground">
                              <Home className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                              <div className="min-w-0">
                                <p className="truncate font-bold text-foreground">{accom.name}</p>
                                {accom.address && <p className="truncate">{accom.address}</p>}
                              </div>
                            </div>
                          )}
                          {/* Outbound transport */}
                          {transport && !isLast && (
                            <Badge variant="sun" className="mt-1.5 max-w-full">
                              <span className="truncate">
                                → {modeLabel(transport.mode)}
                                {places ? ` · ${places}` : ""}
                              </span>
                            </Badge>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>

            <div className="flex min-w-0 flex-col gap-3.5 lg:gap-5">
              {/* ── Route map (ours; the kit has no map on this page) ── */}
              {mapStops.length > 0 && (
                <section aria-label="Route map">
                  <RouteMap stops={mapStops} height={340} home={homeMapPoint(trip)} showReturn={trip.roundTrip ?? false} />
                </section>
              )}

              {/* ── Money: kit lilac Card — the public page never shows costs ── */}
              <Card data-slot="share-money" tone="lilac" className="p-4 lg:p-[22px]">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em]">Money</p>
                <p className="mt-1.5 text-[13px] font-medium">
                  Hidden on shared links. Only people on the trip see costs and notes.
                </p>
              </Card>
            </div>
          </div>

          {/* ── Day by day: kit Days rows (Timeline, read-only agenda variant) ── */}
          {(scope.includeAccommodation ||
            scope.includeTransport ||
            scope.includeDailyPlans) && (
            <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
              <h2
                id="timeline-heading"
                className="font-display text-xl font-extrabold leading-tight tracking-[-0.03em]"
              >
                Day by day
              </h2>
              <ol className="flex flex-col gap-3">
                {itinerary.map((day) => {
                  const isToday = phase === "travelling" && day.dateISO === todayISO;
                  return (
                    <li key={day.dateISO}>
                      <Card
                        shadow={isToday ? 4 : 2}
                        className={cn("p-4", isToday && "ring-[3px] ring-coral")}
                        aria-current={isToday ? "date" : undefined}
                      >
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <h3 className="flex items-center gap-2 font-display text-base font-extrabold tracking-[-0.02em]">
                            {formatLongDate(day.dateISO)}
                            {isToday && <Badge variant="coral" caps>Today</Badge>}
                          </h3>
                          {day.stop && (
                            <span className="text-xs font-medium text-muted-foreground">
                              {day.stop.name}
                              {day.stop.country ? `, ${day.stop.country}` : ""}
                            </span>
                          )}
                        </div>
                        <Timeline day={day} variant="agenda" />
                      </Card>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </main>

        {/* ── Footer: kit closing line ── */}
        <footer className="py-2 text-center text-xs font-medium text-muted-foreground">
          Made with Teepee · plan it with your people
        </footer>
      </div>
    </div>
  );
}
