import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Bed, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { formatLongDate, dayNumberInTrip } from "@/lib/dates";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
import {
  buildItinerary,
  effectiveTodayISO,
  pickDayPlan,
  isFreeFormDay,
  dayHasEntries,
} from "@/lib/itinerary";
import { buildDayMapModel, buildItemDirections } from "@/lib/day-map";
import { nearbyWishlistItems, dayIdeasWishlist } from "@/lib/nearby";
import { chapterForDate } from "@/lib/chapters";
import { buildSpendSoFar, type SpendCost } from "@/lib/spend-so-far";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Timeline } from "@/components/trip/timeline";
import { DayMapPanel } from "@/components/trip/day-map-panel";
import { NearbyWishlist } from "@/components/trip/nearby-wishlist";
import { DayIdeas } from "@/components/trip/day-ideas";
import { MapLink } from "@/components/trip/map-link";
import { TransportCountdown } from "@/components/trip/transport-countdown";
import { SpendSoFarCard } from "@/components/trip/spend-so-far-card";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import { zoneLabel } from "@/lib/time-display";
import type { TransportMode } from "@/lib/enums";
import { AttachmentLinks } from "@/components/trip/attachment-links";
import { ChapterChip } from "@/components/trip/chapter-chip";
import { WISHLIST_IDEA_WHERE, THINGS_TO_DO_WHERE, REAL_PLAN } from "@/lib/plan-scope";
import { buildCostLabelMap } from "@/lib/cost-labels";
import { buildUpcomingPayments } from "@/lib/upcoming-payments";
import { UpcomingPaymentsCard } from "@/components/trip/upcoming-payments-card";

/** Exported for className assertion in tests — must match the JSX below. */
export const TRAVELLING_DESKTOP_GRID_CLASS =
  "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_21.25rem] lg:items-start";

export async function PhaseTravelling({ tripId }: { tripId: string }) {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { startDate: true, endDate: true, homeCurrency: true, chaptersEnabled: true },
  });
  if (!trip) notFound();

  // A date-less trip has no calendar to anchor "today" against.
  if (!trip.startDate) {
    return (
      <EmptyState
        icon={CalendarDays}
        tone="sun"
        title="No dates yet."
        description="Set your trip's start date to see a day-by-day view of today."
      />
    );
  }

  const startDate = trip.startDate;
  const endDate = trip.endDate ?? trip.startDate;

  // Fetch all itinerary data (plus costs + chapters + located wishlist candidates).
  // Reminders are NOT fetched here: the Reminders card is rendered by the trip
  // Home page in every Phase, not only while Travelling.
  const [stops, items, transports, accommodations, costs, chapters, wishlist, allAttachments] = await Promise.all([
    db.stop.findMany({
      // Rough (date-less) stops don't appear on a dated "today" view.
      // Dated views follow the real plan — CONTEXT.md; consistent with
      // calendar/day/print/summary. Policy (not a BND-2 spelling exemption):
      // deliberately ignores `?plan=` — never wire in a variable plan here.
      where: { tripId, ...REAL_PLAN, arriveDate: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        country: true,
        countryCode: true,
        lat: true,
        lng: true,
        timezone: true,
        arriveDate: true,
        departDate: true,
        sortOrder: true,
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
        confirmation: true,
        notes: true,
        lat: true,
        lng: true,
      },
    }),
    db.cost.findMany({
      where: { tripId, ...REAL_PLAN },
      select: {
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
      },
    }),
    // A disabled trip renders as if it had no chapters (Task 13) — skip the
    // query entirely rather than fetch-then-discard.
    trip.chaptersEnabled
      ? db.chapter.findMany({
          where: { tripId, ...REAL_PLAN },
          orderBy: { startDate: "asc" },
          select: {
            id: true,
            name: true,
            colour: true,
            startDate: true,
            endDate: true,
          },
        })
      : Promise.resolve([]),
    db.item.findMany({
      where: {
        tripId,
        ...WISHLIST_IDEA_WHERE, // stopId: null, date: null — exclude plan-owned things-to-do (ADR 0022)
      },
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

  // Trip's reference-timezone "today" (things-to-fix P0-2) — the fetched
  // stops already carry timezone/arriveDate/departDate, in sortOrder order.
  // Every plan-entity query above is scoped to the real plan (REAL_PLAN)
  // — dated views follow the real plan (CONTEXT.md; consistent with
  // calendar/day/print/summary) — so `stops` is already fork-free here.
  const today = todayISOInZone(currentTripTimezone(stops));
  const effectiveDate = effectiveTodayISO(today, startDate, endDate);

  const isBeforeTrip = today < startDate;
  const isAfterTrip = today > endDate;
  const isWithinTrip = today >= startDate && today <= endDate;

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
      checkInTime: a.checkInTime,
      checkOutTime: a.checkOutTime,
      confirmation: a.confirmation,
      notes: a.notes,
    })),
  });

  const dayPlan = pickDayPlan(itinerary, effectiveDate);

  // ── Attachments by target id ───────────────────────────────────────────────
  const attachmentsByTarget = allAttachments.reduce<Record<string, typeof allAttachments>>(
    (acc, att) => {
      if (att.targetId) {
        (acc[att.targetId] ??= []).push(att);
      }
      return acc;
    },
    {},
  );

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
        const aAt = a.transport.depAt ? new Date(a.transport.depAt).getTime() : 0;
        const bAt = b.transport.depAt ? new Date(b.transport.depAt).getTime() : 0;
        return aAt - bAt;
      });
    return allDeps[0] ?? null;
  })();

  const effectiveStop = dayPlan?.stop ?? null;

  // ── Spend so far ────────────────────────────────────────────────────────────
  const homeCurrency = trip.homeCurrency;
  const spend = buildSpendSoFar({
    costs: costs as SpendCost[],
    homeCurrency,
    tripStart: startDate,
    tripEnd: endDate,
    today: effectiveDate,
  });

  // ── Upcoming payments ───────────────────────────────────────────────────────
  // Owner-label map (lib/cost-labels.ts): prefer the linked stop's current
  // name over the transport's free-text depPlace/arrPlace (they're mutually
  // exclusive — a stop-linked transport carries no free text of its own),
  // falling back to the free text for transports with no stop link.
  const stopName = new Map(stops.map((s) => [s.id, s.name] as const));
  const ownerNames = buildCostLabelMap({
    items: items.map((i) => ({ id: i.id, title: i.title })),
    accommodations: accommodations.map((a) => ({ id: a.id, name: a.name })),
    transports: transports.map((t) => ({
      id: t.id,
      mode: t.mode,
      depPlace: (t.fromStopId ? stopName.get(t.fromStopId) : null) ?? t.depPlace ?? null,
      arrPlace: (t.toStopId ? stopName.get(t.toStopId) : null) ?? t.arrPlace ?? null,
    })),
  });
  // `today` (trip-timezone "now"), not `effectiveDate` (clamped to the trip's
  // dated window) — a due date can fall before/after the trip itself.
  const upcomingPayments = buildUpcomingPayments({ costs, ownerNames, today });

  // ── Day-map model (for effectiveDate) ──────────────────────────────────────
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

  const dayAccommodation = tonightAccom
    ? {
        id: tonightAccom.id,
        name: tonightAccom.name,
        lat: tonightAccom.lat,
        lng: tonightAccom.lng,
        address: tonightAccom.address,
      }
    : null;

  const dayTransportIds = new Set(
    (dayPlan?.transportEntries ?? []).map((e) => e.transport.id),
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

  // ── Day ideas (free-form days — CONTEXT.md "Day ideas", ADR 0044). This IS
  // the Travelling phase, so no phase check is needed here. ─────────────────
  const freeForm = dayPlan ? isFreeFormDay(dayPlan) : false;
  const dayStop = stops.find((s) => s.id === effectiveStop?.id) ?? null;
  const thingsToDo =
    freeForm && dayStop
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

  const totalDays = dayNumberInTrip(endDate, startDate);
  // Timeline's own "anything to show?" check (one helper, shared), so an
  // empty day gets this card's empty treatment.
  const hasEntries = dayPlan != null && dayHasEntries(dayPlan);
  const stopLocated = effectiveStop ? stops.find((s) => s.id === effectiveStop.id) : undefined;

  return (
    <div className="flex flex-col gap-3 lg:gap-[18px]">
      {/* ── Header (kit Today: "Day 6 of 12" label over the date) ── */}
      <div className="flex flex-col gap-1 pt-2">
        {isWithinTrip && (
          <p className="flex flex-wrap items-center gap-1.5 text-label text-muted-foreground">
            <span>
              Day {dayNum} of {totalDays}
            </span>
            {currentChapter && (
              <>
                <span aria-hidden="true">·</span>
                <ChapterChip name={currentChapter.name} colour={currentChapter.colour} />
              </>
            )}
          </p>
        )}
        <h2 className="font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] text-foreground lg:text-4xl">
          <span className="sr-only">Today, </span>
          {formatLongDate(effectiveDate)}
        </h2>

        {/* Out-of-trip notice */}
        {isBeforeTrip && (
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Your trip starts on {formatLongDate(startDate)} — here&apos;s day one.
          </p>
        )}
        {isAfterTrip && (
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Your trip has ended. Looking back at the last day.
          </p>
        )}
      </div>

      {/* ── Two-column desktop grid (kit Today: main column + side rail) ── */}
      {/* Mobile: single column; cards stack in natural order (up next + plan first, rail below). */}
      <div className={TRAVELLING_DESKTOP_GRID_CLASS} data-testid="today-grid">
        {/* ── Main column: up next · today's plan · day-map · ideas ── */}
        <div className="flex flex-col gap-3 lg:order-1 lg:gap-[18px]">
          {/* Next transport countdown (kit "Up next" card) */}
          {nextTransportDep && nextTransportDep.transport.depAt && (
            <TransportCountdown
              depAt={new Date(nextTransportDep.transport.depAt).toISOString()}
              depTimeLabel={nextTransportDep.depTimeLabel}
              depZone={zoneLabel(
                stops.find((s) => s.id === nextTransportDep.transport.fromStopId)?.timezone,
                effectiveDate,
              )}
              label={buildTransportLabel(nextTransportDep.transport)}
            />
          )}

          <Card className="p-3.5 lg:p-5">
            <h3 className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground">
              Today&apos;s plan
            </h3>
            <div className="mt-2.5">
              {dayPlan && hasEntries ? (
                <Timeline day={dayPlan} variant="day" itemDirections={itemDirections} attachmentsByTarget={attachmentsByTarget} />
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  tone="sun"
                  title="Nothing planned"
                  description="Nothing is scheduled for this day yet."
                  className="py-5"
                />
              )}
            </div>
          </Card>

          {/* Day map (collapsed toggle) */}
          <DayMapPanel tripId={tripId} model={dayMapModel} />

          {/* Day ideas on free-form days; Nearby Wishlist on planned days */}
          {freeForm ? (
            <DayIdeas
              tripId={tripId}
              date={effectiveDate}
              thingsToDo={thingsToDo}
              wishlistIdeas={wishlistIdeas}
            />
          ) : (
            <NearbyWishlist tripId={tripId} date={effectiveDate} items={nearby} />
          )}
        </div>

        {/* ── Right rail: tonight · where-you-are · spend · payments ── */}
        <div className="flex flex-col gap-3 lg:order-2 lg:gap-[18px]">
          {/* Tonight's accommodation (kit "Tonight" card on the stay fill) */}
          {tonightAccom && (
            <Card tone="lilac" className="p-4 lg:p-5">
              <h3 className="text-label">Tonight&apos;s stay</h3>
              <div className="mt-1.5 flex items-start gap-2.5">
                <Bed className="mt-1 size-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xl font-extrabold leading-tight tracking-[-0.03em]">
                    {tonightAccom.name}
                  </p>
                  {tonightAccom.address && (
                    <div className="mt-1 flex items-center gap-1 text-[13px] font-semibold">
                      <span className="truncate">{tonightAccom.address}</span>
                      <MapLink
                        lat={tonightAccom.lat}
                        lng={tonightAccom.lng}
                        address={tonightAccom.address}
                        label={tonightAccom.name}
                        className="shrink-0 text-foreground"
                      />
                    </div>
                  )}
                  {!tonightAccom.address && (
                    <MapLink
                      lat={tonightAccom.lat}
                      lng={tonightAccom.lng}
                      label={tonightAccom.name}
                      className="mt-1 text-[13px] font-semibold text-foreground"
                    />
                  )}
                  <AttachmentLinks attachments={attachmentsByTarget[tonightAccom.id] ?? []} />
                </div>
              </div>
            </Card>
          )}

          {/* Where you are */}
          {effectiveStop && (
            <Card className="p-4">
              <h3 className="text-label text-muted-foreground">Where you are</h3>
              <div className="mt-1.5 flex items-center gap-2">
                {/* No decorative pin here: MapLink below renders the real one,
                    and help-legend.tsx teaches that glyph as "has a location"
                    (HG-02/HG-10, missed instance found as SW-02). */}
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-xl font-extrabold tracking-[-0.03em] text-foreground">
                    {effectiveStop.name}
                  </span>
                  {effectiveStop.country && (
                    <span className="text-[13px] font-semibold text-muted-foreground">
                      {effectiveStop.country}
                    </span>
                  )}
                </div>
                {/* Gate on real coordinates explicitly: MapLink's own fallback
                    (address || label) would otherwise treat the name/country
                    label as a searchable "location" for every stop, firing the
                    pin even where no location is on record. */}
                {stopLocated?.lat != null && stopLocated?.lng != null && (
                  <MapLink
                    lat={stopLocated.lat}
                    lng={stopLocated.lng}
                    label={
                      effectiveStop.country
                        ? `${effectiveStop.name}, ${effectiveStop.country}`
                        : effectiveStop.name
                    }
                    className="text-muted-foreground hover:text-foreground"
                  />
                )}
              </div>
            </Card>
          )}

          {/* Spend so far (compact glance) */}
          <SpendSoFarCard compact spend={spend} homeCurrency={homeCurrency} />

          {/* Upcoming payments */}
          <UpcomingPaymentsCard payments={upcomingPayments} tripId={tripId} />
        </div>
      </div>

      {/* ── Quick links ── */}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="md">
          <Link href={`/trips/${tripId}/day/${effectiveDate}`}>
            <CalendarDays aria-hidden="true" />
            Full day view
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="secondary" size="md">
          <Link href={`/trips/${tripId}/calendar`}>
            <CalendarDays aria-hidden="true" />
            Days
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
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
