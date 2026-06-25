import { notFound } from "next/navigation";
import {
  MapPin,
  Moon,
  Home,
  ArrowRight,
  LogIn,
  LogOut,
  Clock,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { formatMoney } from "@/lib/money";
import { formatDateRange, formatLongDate, nightsBetween } from "@/lib/dates";
import { buildItinerary } from "@/lib/itinerary";
import { buildBudget, applyFxRatesToCosts } from "@/lib/budget";
import { PrintButton } from "./print-button";
import type { BudgetStop, BudgetItem, BudgetAccommodation, BudgetTransport } from "@/lib/budget";
import type { TransportMode } from "@/lib/enums";

// ---------------------------------------------------------------------------
// Transport mode labels (minimal set — no icon deps for print)
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

export default async function PrintPage({
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
  // The printable itinerary and budget are both anchored to the trip window;
  // a date-less trip has no dated plan to print yet.
  if (!trip.startDate || !trip.endDate) notFound();

  const { homeCurrency, startDate, endDate } = trip;

  // Fetch all the trip data we need for the print view
  const [rawStops, transports, accommodations, items, costs, exchangeRates] =
    await Promise.all([
      db.stop.findMany({
        // Rough (date-less) stops are excluded from the dated print view.
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
          notes: true,
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
          reference: true,
          notes: true,
          sortOrder: true,
        },
      }),
      db.accommodation.findMany({
        where: { tripId },
        orderBy: { checkIn: "asc" },
        select: {
          id: true,
          stopId: true,
          name: true,
          address: true,
          checkIn: true,
          checkOut: true,
          confirmation: true,
        },
      }),
      db.item.findMany({
        where: { tripId },
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
          link: true,
          booking: true,
        },
      }),
      db.cost.findMany({
        where: { tripId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          estimatedMinor: true,
          actualMinor: true,
          currency: true,
          rateToHome: true,
          ownerType: true,
          ownerId: true,
          label: true,
          category: true,
        },
      }),
      db.exchangeRate.findMany({
        where: { tripId },
        select: { base: true, quote: true, rate: true },
      }),
    ]);

  // Apply FX rates to costs
  const costsWithRates = applyFxRatesToCosts({ costs, exchangeRates, homeCurrency });

  // Non-null at runtime: the query filters rough (date-less) stops out.
  const stops = rawStops.map((s) => ({
    ...s,
    timezone: s.timezone ?? "UTC",
    arriveDate: s.arriveDate!,
    departDate: s.departDate!,
  }));

  const budget = buildBudget({
    homeCurrency,
    costs: costsWithRates,
    stops: stops as BudgetStop[],
    items: items as BudgetItem[],
    accommodations: accommodations as BudgetAccommodation[],
    transports: transports as BudgetTransport[],
    tripStart: startDate,
    tripEnd: endDate,
  });

  // Build itinerary
  const itinerary = buildItinerary({
    startDate,
    endDate,
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
      link: item.link,
      booking: item.booking,
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
      reference: t.reference,
    })),
    accommodations: accommodations.map((a) => ({
      id: a.id,
      stopId: a.stopId,
      name: a.name,
      address: a.address,
      checkIn: a.checkIn,
      checkOut: a.checkOut,
      confirmation: a.confirmation,
    })),
  });

  // Build per-stop accommodation lookup
  const accomByStopId = new Map<string, (typeof accommodations)[number]>();
  for (const acc of accommodations) {
    if (!accomByStopId.has(acc.stopId)) {
      accomByStopId.set(acc.stopId, acc);
    }
  }

  // Build transport-from-stop lookup
  const transportFromStop = new Map<string, (typeof transports)[number]>();
  for (const t of transports) {
    if (t.fromStopId && !transportFromStop.has(t.fromStopId)) {
      transportFromStop.set(t.fromStopId, t);
    }
  }

  const totalNights = nightsBetween(startDate, endDate);
  const { grandTotal } = budget;
  const hasActual = grandTotal.actualMinor > 0;

  return (
    <>
      {/*
        Print-specific global styles injected via a style tag.
        Tailwind's print: utilities handle most things, but some chrome
        elements are outside our control (the (app) layout header/nav).
        We target those via CSS class names that Next.js applies.
      */}
      <style>{`
        @media print {
          /* Hide the app chrome that lives outside the page content */
          header,
          nav,
          [data-trip-nav],
          .print-hide {
            display: none !important;
          }
          body {
            background: white !important;
            color: black !important;
          }
          .print-page-break {
            page-break-before: always;
          }
          a {
            text-decoration: none;
            color: black;
          }
        }
      `}</style>

      <div className="flex flex-col gap-8 max-w-3xl mx-auto py-8 px-4 print:py-0 print:px-0 print:max-w-none">

        {/* ── Print control bar (hidden in print) ── */}
        <div className="print:hidden flex items-center justify-between border-b border-border pb-4">
          <p className="text-sm text-muted-foreground">
            Print or save this itinerary as a PDF.
          </p>
          <PrintButton />
        </div>

        {/* ── Trip header ── */}
        <div className="border-b-2 border-foreground pb-4">
          <h1 className="font-display text-4xl font-bold text-foreground leading-tight">
            {trip.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-base text-muted-foreground">
            <span>{formatDateRange(startDate, endDate)}</span>
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

        {/* ── Route (stops list) ── */}
        {stops.length > 0 && (
          <section>
            <h2 className="font-display text-2xl font-semibold mb-4">Route</h2>
            <div className="flex flex-col gap-3">
              {stops.map((stop, idx) => {
                const nights = nightsBetween(stop.arriveDate, stop.departDate);
                const accom = accomByStopId.get(stop.id);
                const transport = transportFromStop.get(stop.id);
                const isLast = idx === stops.length - 1;

                return (
                  <div key={stop.id} className="border border-border rounded-xl p-4 print:border-gray-300 print:rounded-none">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-foreground font-mono text-sm font-bold">
                          {idx + 1}
                        </span>
                        <div>
                          <h3 className="font-display text-lg font-semibold">
                            {stop.name}
                            {stop.country && (
                              <span className="ml-1.5 font-sans text-sm font-normal text-muted-foreground">
                                {stop.country}
                              </span>
                            )}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {formatDateRange(stop.arriveDate, stop.departDate)}
                            {" · "}
                            {nights === 0 ? "Same-day" : `${nights} night${nights !== 1 ? "s" : ""}`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {accom && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <Home className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="font-medium text-foreground">{accom.name}</span>
                        {accom.address && <span className="text-xs">{accom.address}</span>}
                      </div>
                    )}

                    {transport && !isLast && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground print:bg-gray-50">
                        <span className="font-medium">{modeLabel(transport.mode)}</span>
                        {transport.depPlace && (
                          <>
                            <span>from {transport.depPlace}</span>
                          </>
                        )}
                        {transport.arrPlace && (
                          <>
                            <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                            <span>{transport.arrPlace}</span>
                          </>
                        )}
                        {transport.reference && (
                          <span className="ml-auto font-mono text-xs">
                            Ref: {transport.reference}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Day-by-day itinerary ── */}
        <section>
          <h2 className="font-display text-2xl font-semibold mb-4">Day-by-Day</h2>
          <div className="flex flex-col gap-6">
            {itinerary.map((day) => {
              const hasAnything =
                day.timedItems.length > 0 ||
                day.untimedItems.length > 0 ||
                day.transportEntries.length > 0 ||
                day.accommodationEntries.length > 0;

              return (
                <div key={day.dateISO} className="border-t border-border pt-4 print:border-gray-200">
                  {/* Day header */}
                  <div className="flex items-baseline justify-between mb-3">
                    <h3 className="font-display text-lg font-semibold">
                      {formatLongDate(day.dateISO)}
                    </h3>
                    {day.stop && (
                      <span className="text-sm text-muted-foreground">
                        {day.stop.name}
                      </span>
                    )}
                  </div>

                  {!hasAnything && (
                    <p className="text-sm text-muted-foreground italic">No activities planned.</p>
                  )}

                  {/* Accommodation entries */}
                  {day.accommodationEntries.map((entry) => (
                    <div
                      key={`${entry.kind}-${entry.accommodation.id}`}
                      className="mb-2 flex items-center gap-2 text-sm"
                    >
                      {entry.kind === "accommodation-checkin" ? (
                        <LogIn className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                      ) : (
                        <LogOut className="size-3.5 shrink-0 text-rose-600" aria-hidden="true" />
                      )}
                      <span>
                        {entry.kind === "accommodation-checkin" ? "Check-in" : "Check-out"} —{" "}
                        <span className="font-medium">{entry.accommodation.name}</span>
                      </span>
                    </div>
                  ))}

                  {/* Transport entries */}
                  {day.transportEntries.map((entry) => {
                    const t = entry.transport;
                    const isDep = entry.kind === "transport-departure";
                    const depEntry = isDep ? entry : null;
                    const arrEntry = !isDep ? entry : null;

                    return (
                      <div
                        key={`${entry.kind}-${t.id}`}
                        className="mb-2 flex items-start gap-2 text-sm"
                      >
                        <span className="font-mono text-xs text-muted-foreground w-11 text-right shrink-0 pt-0.5">
                          {isDep
                            ? (depEntry?.depTimeLabel ?? "")
                            : (arrEntry?.arrTimeLabel ?? "")}
                        </span>
                        <div>
                          <span className="font-medium">
                            {isDep ? "Departs" : "Arrives"} — {modeLabel(t.mode)}
                          </span>
                          {t.reference && (
                            <span className="ml-1 font-mono text-xs text-muted-foreground">
                              ({t.reference})
                            </span>
                          )}
                          {(t.depPlace || t.arrPlace) && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {t.depPlace && <span>{t.depPlace}</span>}
                              {t.depPlace && t.arrPlace && (
                                <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
                              )}
                              {t.arrPlace && <span>{t.arrPlace}</span>}
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
                      <div key={item.id} className="mb-1.5 flex items-start gap-2 text-sm">
                        <span className="font-mono text-xs text-muted-foreground w-11 text-right shrink-0 pt-0.5">
                          {item.startTime}
                        </span>
                        <div>
                          <span className="font-medium">{item.title}</span>
                          {timeLabel && item.endTime && (
                            <span className="ml-1 text-xs text-muted-foreground">({timeLabel})</span>
                          )}
                          {item.address && (
                            <div className="text-xs text-muted-foreground">{item.address}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Untimed items */}
                  {day.untimedItems.length > 0 && (
                    <div className="mt-1">
                      {day.untimedItems.map((entry) => (
                        <div
                          key={entry.item.id}
                          className="mb-1 flex items-start gap-2 text-sm"
                        >
                          <Clock className="size-3.5 mt-0.5 shrink-0 text-muted-foreground/40" aria-hidden="true" />
                          <span>{entry.item.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Budget summary ── */}
        <section className="print-page-break">
          <h2 className="font-display text-2xl font-semibold mb-4">Budget Summary</h2>
          <div className="border border-border rounded-xl p-5 print:border-gray-300 print:rounded-none">
            {/* Grand total */}
            <div className="flex flex-wrap gap-6 mb-4 pb-4 border-b border-border print:border-gray-200">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                  {hasActual ? "Actual spend" : "Estimated budget"}
                </p>
                <p className="font-mono text-2xl font-bold">
                  {formatMoney(
                    hasActual ? grandTotal.actualMinor : grandTotal.estimatedMinor,
                    homeCurrency,
                  )}
                </p>
              </div>
              {hasActual && grandTotal.estimatedMinor > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                    Original estimate
                  </p>
                  <p className="font-mono text-2xl font-bold text-muted-foreground">
                    {formatMoney(grandTotal.estimatedMinor, homeCurrency)}
                  </p>
                </div>
              )}
            </div>

            {/* By category */}
            {budget.byCategory.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  By category
                </p>
                <div className="flex flex-col gap-1.5">
                  {budget.byCategory.map((bc) => (
                    <div key={bc.category} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{bc.category}</span>
                      <span className="font-mono font-medium">
                        {formatMoney(
                          hasActual && bc.actualMinor > 0 ? bc.actualMinor : bc.estimatedMinor,
                          homeCurrency,
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {budget.hasMissingRates && (
              <p className="mt-3 text-xs text-amber-600">
                Note: Some costs in {budget.missingRates.join(", ")} are excluded (no FX rate available).
              </p>
            )}
          </div>
        </section>

        {/* ── Print footer ── */}
        <div className="hidden print:block mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
          Printed from TEEPEE — {new Date().toLocaleDateString("en-AU", { dateStyle: "long" })}
        </div>
      </div>
    </>
  );
}
