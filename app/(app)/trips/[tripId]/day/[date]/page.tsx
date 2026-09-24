import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen, CalendarDays } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { formatLongDate } from "@/lib/dates";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
import { buildItinerary, isFreeFormDay, dayHasEntries } from "@/lib/itinerary";
import { buildDayMapModel, buildItemDirections } from "@/lib/day-map";
import { nearbyWishlistItems, dayIdeasWishlist } from "@/lib/nearby";
import { flagTightConnections } from "@/lib/flags";
import { daylight, utcHmToZone } from "@/lib/daylight";
import { getDayWeather } from "@/lib/weather";
import { tzAbbrev } from "@/lib/dates";
import { zoneLabel } from "@/lib/time-display";
import { computeTripPhase } from "@/lib/trip-phase";
import { orderPlanStops } from "@/lib/plan-order";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { Timeline } from "@/components/trip/timeline";
import { DayNav } from "@/components/trip/day-nav";
import { DayMapPanel } from "@/components/trip/day-map-panel";
import { NearbyWishlist } from "@/components/trip/nearby-wishlist";
import { DayIdeas } from "@/components/trip/day-ideas";
import { DayFeasibility } from "@/components/trip/day-feasibility";
import { WeatherDaylightCard } from "@/components/trip/weather-daylight-card";
import { AddItemButton } from "@/components/trip/item-form-dialog";
import { JournalEditor } from "@/components/trip/journal-editor";
import { JournalEntryView } from "@/components/trip/journal-entry-view";
import { THINGS_TO_DO_WHERE, WISHLIST_IDEA_WHERE, REAL_PLAN } from "@/lib/plan-scope";
import type { TransportMode } from "@/lib/enums";

/** Reading-width wrapper applied to the timeline+editor stack. Exported for tests. */
export const DAY_READING_WIDTH_CLASS = "mx-auto w-full max-w-3xl";

/** Header row: date/stop left, compact weather card right on desktop. Exported for tests. */
export const DAY_HEADER_GRID_CLASS =
  "flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start";

export default async function DayPage({
  params,
}: {
  params: Promise<{ tripId: string; date: string }>;
}) {
  const { tripId, date } = await params;
  const { user } = await requireTripAccess(tripId);

  // Policy (not a BND-2 spelling exemption): this dated view deliberately
  // always shows the real plan and ignores `?plan=` — see
  // architecture-sitrep-2026-09-22.md. Never wire in a variable plan here.

  // Validate date param format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    notFound();
  }

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { startDate: true, endDate: true },
  });
  if (!trip) notFound();
  // A date-less trip has no dated day pages.
  if (!trip.startDate || !trip.endDate) notFound();

  // Allow a small buffer (2 days) so links from nearby days still work gracefully
  const BUFFER = 2;
  const bufferStart = adjustDate(trip.startDate, -BUFFER);
  const bufferEnd = adjustDate(trip.endDate, BUFFER);
  if (date < bufferStart || date > bufferEnd) {
    notFound();
  }

  // Clamp the date to the real trip range for rendering
  const effectiveDate =
    date < trip.startDate
      ? trip.startDate
      : date > trip.endDate
        ? trip.endDate
        : date;

  const [stops, items, transports, accommodations, journalEntries, journalPhotos, wishlist, allAttachments] =
    await Promise.all([
      db.stop.findMany({
        // Rough (date-less) stops don't appear on a dated day view.
        where: { tripId, ...REAL_PLAN, arriveDate: { not: null } },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          country: true,
          countryCode: true,
          timezone: true,
          arriveDate: true,
          departDate: true,
          sortOrder: true,
          lat: true,
          lng: true,
        },
      }),
      db.item.findMany({
        where: { tripId, ...REAL_PLAN, date: { not: null } },
        orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          title: true,
          category: true,
          date: true,
          startTime: true,
          endTime: true,
          sortOrder: true,
          stopId: true,
          lat: true,
          lng: true,
          address: true,
          link: true,
          booking: true,
          notes: true,
        },
      }),
      db.transport.findMany({
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
          depLat: true,
          depLng: true,
          arrLat: true,
          arrLng: true,
          reference: true,
          notes: true,
        },
      }),
      db.accommodation.findMany({
        where: { tripId, ...REAL_PLAN, checkIn: { lte: effectiveDate }, checkOut: { gte: effectiveDate } },
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
          confirmation: true,
          notes: true,
          lat: true,
          lng: true,
        },
      }),
      // Every Traveller's entry for this date (ARCH-DAT-6: per-Traveller
      // entries, not one shared row) — split into "mine" (editable) and
      // "theirs" (read-only) below.
      db.journalEntry.findMany({
        where: { tripId, date: effectiveDate },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          authorId: true,
          updatedAt: true,
          author: { select: { name: true } },
        },
      }),
      db.attachment.findMany({
        where: { tripId, targetType: "JOURNAL", targetId: effectiveDate },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          filename: true,
          mime: true,
          size: true,
          url: true,
          uploadedById: true,
          createdAt: true,
        },
      }),
      db.item.findMany({
        where: { tripId, ...REAL_PLAN, ...WISHLIST_IDEA_WHERE },
        select: { id: true, title: true, category: true, lat: true, lng: true, countryCode: true },
      }),
      db.attachment.findMany({
        where: { tripId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          filename: true,
          mime: true,
          size: true,
          url: true,
          uploadedById: true,
          createdAt: true,
          targetId: true,
        },
      }),
    ]);

  const itinerary = buildItinerary({
    startDate: trip.startDate,
    endDate: trip.endDate,
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
      checkInTime: a.checkInTime,
      checkOutTime: a.checkOutTime,
      confirmation: a.confirmation,
      notes: a.notes,
    })),
  });

  // Split the date's journal entries into the current Traveller's own
  // (editable) entry and everyone else's (read-only).
  const myJournalEntry = journalEntries.find((e) => e.authorId === user.id) ?? null;
  const otherJournalEntries = journalEntries.filter((e) => e.authorId !== user.id);

  const dayPlan = itinerary.find((d) => d.dateISO === effectiveDate);
  if (!dayPlan) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Day not found"
        description="This date doesn't appear to fall within your trip range."
      />
    );
  }

  const stopOptions = stops.map((s) => ({ id: s.id, name: s.name }));

  // ── Attachments by target id ───────────────────────────────────────────────
  // Group all trip attachments into a flat map keyed by targetId.
  // Entity ids are globally-unique cuids, so one flat map covers all entity types.
  const attachmentsByTarget = allAttachments.reduce<Record<string, typeof allAttachments>>(
    (acc, att) => {
      if (att.targetId) {
        (acc[att.targetId] ??= []).push(att);
      }
      return acc;
    },
    {},
  );

  // ── Day-map model ──────────────────────────────────────────────────────────
  // Items for this specific date (with coords)
  const dayItems = items
    .filter((item) => item.date === effectiveDate)
    .map((item) => ({
      id: item.id,
      title: item.title,
      lat: item.lat,
      lng: item.lng,
      address: item.address,
      startTime: item.startTime,
      sortOrder: item.sortOrder,
    }));

  // Tonight's accommodation: checkIn <= effectiveDate < checkOut
  const tonightAccomRaw = accommodations.find(
    (a) => a.checkIn <= effectiveDate && a.checkOut > effectiveDate,
  ) ?? null;
  const dayAccommodation = tonightAccomRaw
    ? {
        id: tonightAccomRaw.id,
        name: tonightAccomRaw.name,
        lat: tonightAccomRaw.lat,
        lng: tonightAccomRaw.lng,
        address: tonightAccomRaw.address,
      }
    : null;

  // Transports active on this day (departing or arriving): collect ids from dayPlan
  const dayTransportIds = new Set(
    dayPlan.transportEntries.map((e) => e.transport.id),
  );
  const dayTransports = transports
    .filter((t) => dayTransportIds.has(t.id))
    .map((t) => ({
      id: t.id,
      depPlace: t.depPlace,
      arrPlace: t.arrPlace,
      depLat: t.depLat,
      depLng: t.depLng,
      arrLat: t.arrLat,
      arrLng: t.arrLng,
    }));

  const dayMapModel = buildDayMapModel({
    date: effectiveDate,
    items: dayItems,
    accommodation: dayAccommodation,
    transports: dayTransports,
  });
  const itemDirections = buildItemDirections(dayMapModel);

  // ── Nearby Wishlist items ─────────────────────────────────────────────────
  // Anchors: located scheduled items for today + tonight's accommodation
  const nearbyAnchors = [
    ...dayItems
      .filter((i) => i.lat != null && i.lng != null)
      .map((i) => ({ lat: i.lat!, lng: i.lng! })),
    ...(dayAccommodation?.lat != null && dayAccommodation?.lng != null
      ? [{ lat: dayAccommodation.lat!, lng: dayAccommodation.lng! }]
      : []),
  ];
  // Keep nearbyWishlistItems working from the broadened (all-ideas) query by
  // filtering back down to located candidates only (Task 16).
  const wishlistLocated = wishlist.filter((i) => i.lat != null && i.lng != null);
  const nearby = nearbyWishlistItems({
    anchors: nearbyAnchors,
    candidates: wishlistLocated.map((i) => ({
      id: i.id,
      title: i.title,
      category: i.category,
      lat: i.lat!,
      lng: i.lng!,
    })),
  });

  // ── Day ideas (free-form days, Travelling phase only — CONTEXT.md "Day
  // ideas", ADR 0044) ─────────────────────────────────────────────────────────
  const today = todayISOInZone(currentTripTimezone(orderPlanStops(stops)));
  const phase = computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today });
  const freeForm = isFreeFormDay(dayPlan);
  const hasEntries = dayHasEntries(dayPlan);
  const dayStop = stops.find((s) => s.id === dayPlan.stop?.id) ?? null;
  // Only fetch when DayIdeas will actually render (freeForm + Travelling +
  // a resolvable stop) — a pre-departure free-form day shows the light
  // "browse your wishlist" link instead, so fetching things-to-do for it
  // would be wasted work.
  const thingsToDo =
    freeForm && phase === "travelling" && dayStop
      ? await db.item.findMany({
          where: { tripId, ...REAL_PLAN, ...THINGS_TO_DO_WHERE, stopId: dayStop.id },
          orderBy: { sortOrder: "asc" },
          select: { id: true, title: true, category: true, startTime: true, endTime: true },
        })
      : [];
  const wishlistIdeas = dayStop
    ? dayIdeasWishlist({
        stop: { lat: dayStop.lat, lng: dayStop.lng, countryCode: dayStop.countryCode },
        candidates: wishlist,
      })
    : [];

  // ── Weather & daylight ────────────────────────────────────────────────────
  const dlRaw =
    dayStop?.lat != null && dayStop?.lng != null
      ? daylight(dayStop.lat, dayStop.lng, effectiveDate)
      : null;

  // Convert UTC sunrise/sunset to the stop's local timezone for display.
  const stopTimezone = dayStop?.timezone ?? "UTC";
  const dl = dlRaw
    ? {
        sunrise:
          dlRaw.sunriseUTC != null
            ? utcHmToZone(effectiveDate, dlRaw.sunriseUTC, stopTimezone)
            : null,
        sunset:
          dlRaw.sunsetUTC != null
            ? utcHmToZone(effectiveDate, dlRaw.sunsetUTC, stopTimezone)
            : null,
        dayLengthMin: dlRaw.dayLengthMin,
        polarDay: dlRaw.polarDay,
        polarNight: dlRaw.polarNight,
        tzLabel: tzAbbrev(stopTimezone, effectiveDate),
      }
    : null;

  const wx =
    dayStop?.lat != null && dayStop?.lng != null
      ? await getDayWeather({
          lat: dayStop.lat,
          lng: dayStop.lng,
          dateISO: effectiveDate,
          today: todayISOInZone(stopTimezone ?? "UTC"),
        })
      : null;

  const feasibility = flagTightConnections(
    items
      .filter((it) => it.date === effectiveDate)
      .map((it) => ({
        id: it.id,
        stopId: it.stopId,
        date: it.date,
        startTime: it.startTime,
        endTime: it.endTime,
        lat: it.lat,
        lng: it.lng,
      })),
    transports.map((t) => ({
      id: t.id,
      fromStopId: t.fromStopId,
      toStopId: t.toStopId,
      mode: t.mode,
    })),
    { windingFactor: 1.5, avgSpeedKph: 80 },
  ).map((f) => ({ severity: f.severity, message: f.message }));

  // Pre-departure free-form day: the light "browse your wishlist" nudge. On a
  // wholly empty day it rides in the empty state instead of repeating it.
  const showIdeas = freeForm && phase === "travelling" && dayStop;
  const browseWishlist = (
    <>
      Nothing planned yet —{" "}
      <Link href={`/trips/${tripId}/wishlist`} className="font-bold text-foreground underline underline-offset-2">
        browse your wishlist
      </Link>{" "}
      or add something below.
    </>
  );
  const nudgeInEmptyState = freeForm && !showIdeas && !hasEntries;

  return (
    <div className="flex flex-col gap-4 lg:gap-[18px]">
      <div className={DAY_HEADER_GRID_CLASS}>
        {/* Day header */}
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] text-foreground lg:text-4xl">
            {formatLongDate(effectiveDate)}
          </h2>
          {dayPlan.stop && (
            <p className="text-sm font-medium text-muted-foreground">
              {dayPlan.stop.name}
              {dayPlan.stop.country ? `, ${dayPlan.stop.country}` : ""}
              {dayPlan.stop.timezone && (
                <span className="text-xs">
                  {" · "}{zoneLabel(dayPlan.stop.timezone, effectiveDate)}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Weather + daylight (compact, beside the header on desktop) */}
        {dl && <WeatherDaylightCard compact weather={wx} daylight={dl} />}
      </div>

      {/* Prev / Next navigation */}
      <DayNav
        tripId={tripId}
        currentDate={effectiveDate}
        startDate={trip.startDate}
        endDate={trip.endDate}
      />

      {/* Day map (collapsed toggle) */}
      <DayMapPanel tripId={tripId} model={dayMapModel} />

      {/* Reading column: timeline + editor stack capped at max-w-3xl */}
      <div className={`${DAY_READING_WIDTH_CLASS} flex flex-col gap-4 lg:gap-[18px]`}>
        {/* Nearby Wishlist items */}
        {showIdeas ? (
          <DayIdeas
            tripId={tripId}
            date={effectiveDate}
            thingsToDo={thingsToDo}
            wishlistIdeas={wishlistIdeas}
          />
        ) : freeForm ? (
          nudgeInEmptyState ? null : (
            <p className="text-sm font-medium text-muted-foreground">{browseWishlist}</p>
          )
        ) : (
          <NearbyWishlist tripId={tripId} date={effectiveDate} items={nearby} />
        )}

        {/* The day's plan (kit Days day card: time · thing rows) */}
        <Card className="p-3.5 lg:p-5">
          <h3 className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground">
            Day plan
          </h3>
          <div className="mt-2.5">
            {hasEntries ? (
              <Timeline day={dayPlan} variant="day" itemDirections={itemDirections} attachmentsByTarget={attachmentsByTarget} showUnschedule />
            ) : (
              <EmptyState
                icon={CalendarDays}
                tone="sun"
                title="Nothing planned"
                description={nudgeInEmptyState ? browseWishlist : "Nothing is scheduled for this day yet."}
                className="py-5"
              />
            )}
          </div>
        </Card>

        {/* Feasibility advisory (kit sun "heads up" card) */}
        <DayFeasibility entries={feasibility} />

        {/* Quick add (kit: block secondary "+ Add to this day") */}
        <AddItemButton
          tripId={tripId}
          stops={stopOptions}
          tripStartDate={effectiveDate}
          defaultUnscheduled={false}
          label="Add to this day"
          variant="secondary"
          size="md"
          className="w-full"
        />

        {/* Journal */}
        <section aria-labelledby="journal-heading" className="mt-2">
          <div className="mb-3 flex items-center gap-2">
            <BookOpen className="size-[18px] text-foreground" strokeWidth={2.5} aria-hidden />
            <h3
              id="journal-heading"
              className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground"
            >
              Journal
            </h3>
          </div>
          <div className="flex flex-col gap-3">
            {/* Other Travellers' entries for this day — read-only */}
            {otherJournalEntries.map((entry) => (
              <JournalEntryView
                key={entry.id}
                body={entry.body}
                updatedAt={entry.updatedAt}
                authorName={entry.author.name}
              />
            ))}
            <JournalEditor
              tripId={tripId}
              date={effectiveDate}
              initialBody={myJournalEntry?.body ?? ""}
              updatedAt={myJournalEntry?.updatedAt ?? null}
              photos={journalPhotos}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Add or subtract days from a YYYY-MM-DD string.
 * Tiny inline helper to avoid extra imports.
 */
function adjustDate(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
