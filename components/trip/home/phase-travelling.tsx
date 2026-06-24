import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, MapPin, Bed, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { todayISO, formatLongDate, dayNumberInTrip } from "@/lib/dates";
import {
  buildItinerary,
  effectiveTodayISO,
  pickDayPlan,
} from "@/lib/itinerary";
import { chapterForDate } from "@/lib/chapters";
import { EmptyState } from "@/components/ui/empty-state";
import { Timeline } from "@/components/trip/timeline";
import { MapLink } from "@/components/trip/map-link";
import { TransportCountdown } from "@/components/trip/transport-countdown";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import type { TransportMode } from "@/lib/enums";
import {
  RemindersCard,
  type ReminderItem,
} from "@/components/trip/reminders-card";
import { ChapterChip } from "@/components/trip/chapter-chip";

export async function PhaseTravelling({ tripId }: { tripId: string }) {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { startDate: true, endDate: true },
  });
  if (!trip) notFound();

  // A date-less trip has no calendar to anchor "today" against.
  if (!trip.startDate) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No dates yet"
        description="Set your trip's start date to see a day-by-day view of today."
      />
    );
  }

  const startDate = trip.startDate;
  const endDate = trip.endDate ?? trip.startDate;

  const today = todayISO();
  const effectiveDate = effectiveTodayISO(today, startDate, endDate);

  const isBeforeTrip = today < startDate;
  const isAfterTrip = today > endDate;
  const isWithinTrip = today >= startDate && today <= endDate;

  // Fetch all itinerary data (plus reminders + chapters)
  const [stops, items, transports, accommodations, reminders, chapters] = await Promise.all([
    db.stop.findMany({
      // Rough (date-less) stops don't appear on a dated "today" view.
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
    db.item.findMany({
      where: { tripId, date: { not: null } },
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
        notes: true,
        lat: true,
        lng: true,
      },
    }),
    db.reminder.findMany({
      where: { tripId },
      orderBy: { fireAt: "asc" },
      select: {
        id: true,
        title: true,
        fireAt: true,
        sent: true,
      },
    }),
    db.chapter.findMany({
      where: { tripId },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        name: true,
        colour: true,
        startDate: true,
        endDate: true,
      },
    }),
  ]);

  const currentChapter = chapterForDate(effectiveDate, chapters);
  const dayNum = dayNumberInTrip(effectiveDate, startDate);

  const itinerary = buildItinerary({
    startDate,
    endDate,
    // Non-null at runtime: the query filters rough (date-less) stops out.
    stops: stops.map((s) => ({
      id: s.id,
      name: s.name,
      country: s.country,
      timezone: s.timezone ?? "UTC",
      arriveDate: s.arriveDate!,
      departDate: s.departDate!,
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
      notes: item.notes,
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
      notes: t.notes,
    })),
    accommodations: accommodations.map((a) => ({
      id: a.id,
      stopId: a.stopId,
      name: a.name,
      address: a.address,
      checkIn: a.checkIn,
      checkOut: a.checkOut,
      confirmation: a.confirmation,
      notes: a.notes,
    })),
  });

  const dayPlan = pickDayPlan(itinerary, effectiveDate);

  // Find tonight's accommodation (checkIn <= effectiveDate < checkOut)
  const tonightAccom = accommodations.find(
    (a) => a.checkIn <= effectiveDate && a.checkOut > effectiveDate,
  ) ?? null;

  // Find next upcoming transport departure from today's entries
  // (one that hasn't yet departed — depAt > now)
  const now = new Date();
  const nextTransportDep = (() => {
    // Search day plan's transport entries first, then future days
    const allDeps = itinerary
      .filter((d) => d.dateISO >= effectiveDate)
      .flatMap((d) => d.transportEntries)
      .filter((e) => e.kind === "transport-departure")
      .map((e) => e as import("@/lib/itinerary").TransportDepartureEntry)
      .filter((e) => {
        const depAt = e.transport.depAt;
        if (!depAt) return false;
        return new Date(depAt) > now;
      })
      .sort((a, b) => {
        const aAt = new Date(a.transport.depAt!).getTime();
        const bAt = new Date(b.transport.depAt!).getTime();
        return aAt - bAt;
      });
    return allDeps[0] ?? null;
  })();

  const effectiveStop = dayPlan?.stop ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold text-foreground">
          Today
        </h2>
        <p className="text-sm text-muted-foreground">
          {formatLongDate(effectiveDate)}
        </p>

        {/* Day / chapter context label */}
        {isWithinTrip && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>Day {dayNum}</span>
            {currentChapter && (
              <>
                <span aria-hidden="true">·</span>
                <ChapterChip name={currentChapter.name} colour={currentChapter.colour} />
              </>
            )}
          </p>
        )}

        {/* Out-of-trip notice */}
        {isBeforeTrip && (
          <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
            Your trip starts on {formatLongDate(startDate)} — here&apos;s day one.
          </p>
        )}
        {isAfterTrip && (
          <p className="mt-1 text-sm text-muted-foreground italic">
            Your trip has ended. Looking back at the last day.
          </p>
        )}
      </div>

      {/* ── Where you are ── */}
      {effectiveStop && (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            Where you are
          </h3>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
            <MapPin className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="font-display text-lg font-semibold text-foreground">
                {effectiveStop.name}
              </span>
              {effectiveStop.country && (
                <span className="text-sm text-muted-foreground">
                  {effectiveStop.country}
                </span>
              )}
            </div>
            <MapLink
              lat={stops.find((s) => s.id === effectiveStop.id)?.lat}
              lng={stops.find((s) => s.id === effectiveStop.id)?.lng}
              label={
                effectiveStop.country
                  ? `${effectiveStop.name}, ${effectiveStop.country}`
                  : effectiveStop.name
              }
              className="text-muted-foreground/70 hover:text-primary"
            />
          </div>
        </section>
      )}

      {/* ── Next transport countdown ── */}
      {nextTransportDep && nextTransportDep.transport.depAt && (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            Next departure
          </h3>
          <TransportCountdown
            depAt={new Date(nextTransportDep.transport.depAt).toISOString()}
            depTimeLabel={nextTransportDep.depTimeLabel}
            label={buildTransportLabel(nextTransportDep.transport)}
          />
        </section>
      )}

      {/* ── Today's plan ── */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
          Today&apos;s plan
        </h3>
        <div className="rounded-xl border border-border bg-card px-4 py-4">
          {dayPlan ? (
            <Timeline day={dayPlan} variant="day" />
          ) : (
            <p className="py-2 text-sm text-muted-foreground italic">
              Nothing planned for this day.
            </p>
          )}
        </div>
      </section>

      {/* ── Tonight's accommodation ── */}
      {tonightAccom && (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            Tonight&apos;s stay
          </h3>
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <Bed className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{tonightAccom.name}</p>
              {tonightAccom.address && (
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="truncate">{tonightAccom.address}</span>
                  <MapLink
                    lat={tonightAccom.lat}
                    lng={tonightAccom.lng}
                    address={tonightAccom.address}
                    label={tonightAccom.name}
                    className="shrink-0 text-muted-foreground/60 hover:text-primary"
                  />
                </div>
              )}
              {!tonightAccom.address && (
                <MapLink
                  lat={tonightAccom.lat}
                  lng={tonightAccom.lng}
                  label={tonightAccom.name}
                  className="mt-0.5 text-xs text-muted-foreground/60 hover:text-primary"
                />
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Reminders ── */}
      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
          Reminders
        </h3>
        <RemindersCard
          tripId={tripId}
          reminders={reminders as ReminderItem[]}
        />
      </section>

      {/* ── Quick links ── */}
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href={`/trips/${tripId}/day/${effectiveDate}`}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
          Full day view
          <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
        </Link>
        <Link
          href={`/trips/${tripId}/calendar`}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
          Calendar
          <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTransportLabel(transport: {
  mode: string;
  reference?: string | null;
  depPlace?: string | null;
  arrPlace?: string | null;
}): string {
  const meta = TRANSPORT_MODE_META[transport.mode as TransportMode];
  const modeLabel = meta?.label ?? transport.mode;
  const ref = transport.reference ? ` ${transport.reference}` : "";
  const route =
    transport.depPlace && transport.arrPlace
      ? ` · ${transport.depPlace} → ${transport.arrPlace}`
      : transport.depPlace
        ? ` · from ${transport.depPlace}`
        : transport.arrPlace
          ? ` · to ${transport.arrPlace}`
          : "";
  return `${modeLabel}${ref}${route}`;
}
