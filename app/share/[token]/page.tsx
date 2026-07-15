import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  MapPin,
  Moon,
  Home,
  ArrowRight,
  LogIn,
  LogOut,
} from "lucide-react";
import { db } from "@/lib/db";
import { formatDateRange, formatLongDate, nightsBetween } from "@/lib/dates";
import { buildItinerary } from "@/lib/itinerary";
import { RouteMapLoader as RouteMap } from "@/components/trip/route-map-loader";
import type { RouteMapStop } from "@/components/trip/route-map";
import type { TransportMode } from "@/lib/enums";

// ---------------------------------------------------------------------------
// Metadata — noindex so search engines don't index private trips
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Shared Itinerary — TEEPEE",
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
    include: {
      trip: {
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
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

  // Fetch itinerary data — NO costs, no notes, no confirmations
  const [rawStops, transports, accommodations, items] = await Promise.all([
    db.stop.findMany({
      // Rough (date-less) stops aren't part of the dated public itinerary.
      where: { tripId, forkId: null, arriveDate: { not: null } },
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
    }),
    db.transport.findMany({
      where: { tripId, forkId: null },
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
    }),
    db.accommodation.findMany({
      where: { tripId, forkId: null },
      orderBy: { checkIn: "asc" },
      select: {
        id: true,
        stopId: true,
        name: true,
        address: true,
        checkIn: true,
        checkOut: true,
        // confirmation intentionally omitted (private booking ref)
        // notes intentionally omitted
      },
    }),
    db.item.findMany({
      where: { tripId, forkId: null },
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
    }),
  ]);

  // Non-null at runtime: the query filters rough (date-less) stops out.
  const stops = rawStops.map((s) => ({
    ...s,
    timezone: s.timezone ?? "UTC",
    arriveDate: s.arriveDate!,
    departDate: s.departDate!,
  }));

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
    })),
  });

  const totalNights = nightsBetween(trip.startDate, trip.endDate);

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

  return (
    <div className="min-h-screen bg-background">
      {/* ── Minimal header ── */}
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-1.5 font-display text-lg font-semibold text-foreground">
            <span aria-hidden="true">🛖</span>
            TEEPEE
          </span>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Shared itinerary — read only
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-8">

          {/* ── Trip header ── */}
          <div className="border-b border-border pb-6">
            <h1 className="font-display text-3xl font-bold text-foreground leading-tight mb-2">
              {trip.name}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
              <span className="flex items-center gap-1">
                <Moon className="size-4" aria-hidden="true" />
                {totalNights} night{totalNights !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="size-4" aria-hidden="true" />
                {stops.length} stop{stops.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* ── Route Map ── */}
          {mapStops.length > 0 && (
            <section aria-labelledby="map-heading">
              <h2
                id="map-heading"
                className="font-display text-xl font-semibold text-foreground mb-4 flex items-center gap-2"
              >
                <MapPin className="size-4 text-primary" aria-hidden="true" />
                Route
              </h2>
              <RouteMap stops={mapStops} height={340} />
            </section>
          )}

          {/* ── Stops overview ── */}
          {stops.length > 0 && (
            <section aria-labelledby="stops-heading">
              <h2
                id="stops-heading"
                className="font-display text-xl font-semibold text-foreground mb-4"
              >
                Itinerary at a glance
              </h2>
              <div className="flex flex-col gap-3">
                {stops.map((stop, idx) => {
                  const nights = nightsBetween(stop.arriveDate, stop.departDate);
                  const accom = accomByStopId.get(stop.id);
                  const transport = transportFromStop.get(stop.id);
                  const isLast = idx === stops.length - 1;

                  return (
                    <div
                      key={stop.id}
                      className="rounded-2xl border border-border bg-card p-5 shadow-soft"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
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
                              : `${nights} night${nights !== 1 ? "s" : ""}`}
                          </p>
                        </div>
                      </div>

                      {/* Accommodation name (no confirmation ref — that's private) */}
                      {accom && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                          <Home className="size-3.5 shrink-0" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-foreground">{accom.name}</span>
                            {accom.address && (
                              <span className="block truncate text-xs">{accom.address}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Outbound transport */}
                      {transport && !isLast && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                          <span className="shrink-0 font-medium text-foreground">
                            {modeLabel(transport.mode)}
                          </span>
                          {transport.depPlace && (
                            <div className="min-w-0 flex items-center gap-1">
                              <span className="min-w-0 truncate">from {transport.depPlace}</span>
                            </div>
                          )}
                          {transport.depPlace && transport.arrPlace && (
                            <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
                          )}
                          {transport.arrPlace && (
                            <div className="min-w-0 flex items-center gap-1">
                              <span className="min-w-0 truncate">{transport.arrPlace}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Day-by-day timeline ── */}
          <section aria-labelledby="timeline-heading">
            <h2
              id="timeline-heading"
              className="font-display text-xl font-semibold text-foreground mb-4"
            >
              Day-by-Day
            </h2>
            <div className="flex flex-col gap-1">
              {itinerary.map((day) => {
                const hasAnything =
                  day.timedItems.length > 0 ||
                  day.untimedItems.length > 0 ||
                  day.transportEntries.length > 0 ||
                  day.accommodationEntries.length > 0;

                return (
                  <div
                    key={day.dateISO}
                    className="rounded-2xl border border-border bg-card"
                  >
                    {/* Day header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                      <h3 className="font-display text-base font-semibold text-foreground">
                        {formatLongDate(day.dateISO)}
                      </h3>
                      {day.stop && (
                        <span className="text-xs text-muted-foreground">
                          {day.stop.name}
                          {day.stop.country ? `, ${day.stop.country}` : ""}
                        </span>
                      )}
                    </div>

                    <div className="px-4 py-3 flex flex-col gap-1.5">
                      {!hasAnything && (
                        <p className="text-sm text-muted-foreground italic">
                          Nothing planned.
                        </p>
                      )}

                      {/* Accommodation check-ins */}
                      {day.accommodationEntries
                        .filter((e) => e.kind === "accommodation-checkin")
                        .map((entry) => (
                          <div
                            key={`ci-${entry.accommodation.id}`}
                            className="flex items-center gap-2 text-sm rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/30 px-3 py-1.5"
                          >
                            <LogIn
                              className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                              aria-hidden="true"
                            />
                            <span className="font-medium text-foreground">
                              Check-in — {entry.accommodation.name}
                            </span>
                          </div>
                        ))}

                      {/* Transport entries */}
                      {day.transportEntries.map((entry) => {
                        const t = entry.transport;
                        const isDep = entry.kind === "transport-departure";
                        const depEntry = isDep ? entry : null;
                        const arrEntry = !isDep ? entry : null;
                        const gutterTime = isDep
                          ? (depEntry?.depTimeLabel ?? null)
                          : (arrEntry?.arrTimeLabel ?? null);

                        return (
                          <div
                            key={`${entry.kind}-${t.id}`}
                            className="flex items-start gap-2 text-sm rounded-lg bg-primary/5 border border-primary/10 px-3 py-1.5"
                          >
                            {gutterTime && (
                              <span className="font-mono text-xs text-muted-foreground shrink-0 pt-0.5 w-8 sm:w-10 text-right">
                                {gutterTime}
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <span className="font-medium text-foreground">
                                {isDep ? "Departs" : "Arrives"} — {modeLabel(t.mode)}
                              </span>
                              {(t.depPlace || t.arrPlace) && (
                                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                  {t.depPlace && <span className="min-w-0 truncate">{t.depPlace}</span>}
                                  {t.depPlace && t.arrPlace && (
                                    <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
                                  )}
                                  {t.arrPlace && <span className="min-w-0 truncate">{t.arrPlace}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Timed items */}
                      {day.timedItems.map((entry) => {
                        const { item } = entry;
                        const timeLabel = item.endTime
                          ? `${item.startTime} – ${item.endTime}`
                          : item.startTime;
                        return (
                          <div
                            key={item.id}
                            className="flex items-start gap-2 text-sm px-2 py-0.5"
                          >
                            <span className="font-mono text-xs text-muted-foreground shrink-0 pt-0.5 w-8 sm:w-10 text-right">
                              {item.startTime}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="font-medium text-foreground">
                                {item.title}
                              </span>
                              {timeLabel && item.endTime && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  ({timeLabel})
                                </span>
                              )}
                              {item.address && (
                                <div className="text-xs text-muted-foreground">
                                  {item.address}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Untimed items */}
                      {day.untimedItems.length > 0 && (
                        <div className="mt-0.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70 mb-1">
                            Anytime
                          </p>
                          {day.untimedItems.map((entry) => (
                            <div
                              key={entry.item.id}
                              className="flex items-start gap-2 text-sm px-2 py-0.5"
                            >
                              <div className="h-1.5 w-1.5 mt-2 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
                              <span className="text-foreground/80">
                                {entry.item.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Accommodation check-outs */}
                      {day.accommodationEntries
                        .filter((e) => e.kind === "accommodation-checkout")
                        .map((entry) => (
                          <div
                            key={`co-${entry.accommodation.id}`}
                            className="flex items-center gap-2 text-sm rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/30 px-3 py-1.5"
                          >
                            <LogOut
                              className="size-3.5 shrink-0 text-rose-600 dark:text-rose-400"
                              aria-hidden="true"
                            />
                            <span className="font-medium text-foreground">
                              Check-out — {entry.accommodation.name}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Footer ── */}
          <footer className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
            Shared via TEEPEE · Budget and notes are not included in shared views.
          </footer>

        </div>
      </main>
    </div>
  );
}
