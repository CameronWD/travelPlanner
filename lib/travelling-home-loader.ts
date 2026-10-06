/**
 * The Travelling Home's ONE query path (spec D, Task 17): the phone Phase
 * (components/trip/home/phase-travelling.tsx, layout "phone") and the desktop
 * (lg+) 3-row grid (same component, layout "desktop") both render from this
 * model on the same request. Wrapped in React's `cache()` so the second call
 * — keyed on the primitive (tripId, userId) — is free.
 *
 * Deliberately NO auth import: the only caller is the trip Home page, which
 * has already run `requireTripAccess`. Policy (not a BND-2 spelling
 * exemption): a dated view — always the real plan, ignoring `?plan=`.
 */
import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { dayNumberInTrip } from "@/lib/dates";
import { tripTodayISO } from "@/lib/trip-today";
import {
  buildItinerary,
  effectiveTodayISO,
  pickDayPlan,
  isFreeFormDay,
  dayHasEntries,
  type TransportDepartureEntry,
} from "@/lib/itinerary";
import { titlesByDate } from "@/lib/day-titles";
import { buildDayMapModel, buildItemDirections } from "@/lib/day-map";
import { nearbyWishlistItems, dayIdeasWishlist } from "@/lib/nearby";
import { chapterForDate } from "@/lib/chapters";
import { buildSpendSoFar, type SpendCost } from "@/lib/spend-so-far";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import { zoneLabel } from "@/lib/time-display";
import type { TransportMode } from "@/lib/enums";
import { WISHLIST_IDEA_WHERE, THINGS_TO_DO_WHERE, REAL_PLAN } from "@/lib/plan-scope";
import { buildCostLabelMap } from "@/lib/cost-labels";
import { buildUpcomingPayments } from "@/lib/upcoming-payments";
import { loadTodaysJournal } from "@/lib/journal-loader";

async function loadTravellingHomeUncached(tripId: string, userId: string | null) {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { startDate: true, endDate: true, homeCurrency: true, chaptersEnabled: true },
  });
  if (!trip) notFound();

  // A date-less trip has no calendar to anchor "today" against — the Phase
  // renders its empty treatment.
  if (!trip.startDate) return { kind: "no-dates" as const };

  const startDate = trip.startDate;
  const endDate = trip.endDate ?? trip.startDate;

  // Fetch all itinerary data (plus costs + chapters + located wishlist candidates).
  // Reminders are NOT fetched here: the Reminders card is rendered by the trip
  // Home page in every Phase, not only while Travelling.
  // `.then((rows) => rows)`: one settled promise that both the batch and
  // Today's journal (which needs the Trip's own today) consume.
  const stopsPromise = db.stop
    .findMany({
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
    })
    .then((rows) => rows);
  const [stops, items, transports, accommodations, costs, chapters, wishlist, allAttachments, dayTitleRows, thingsToDoAll, todaysJournal] = await Promise.all([
    stopsPromise,
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
        settlement: true,
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
        title: true,
        mime: true,
        size: true,
        url: true,
        uploadedById: true,
        createdAt: true,
        targetId: true,
      },
    }),
    // Today's Day title (CONTEXT.md "Day title") — through the Stop, so it
    // joins this wave (spec 2026-10-06 §C); resolved for today below.
    db.dayTitle.findMany({
      where: { stop: { tripId, ...REAL_PLAN } },
      select: { stopId: true, dayIndex: true, title: true },
    }),
    // Every Stop's things to do (ADR 0044); the day's Stop is picked below.
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, ...THINGS_TO_DO_WHERE },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, category: true, startTime: true, endTime: true, stopId: true },
    }),
    // Today's journal (spec K) — never for a day still ahead (CONTEXT.md
    // "Journal"): before day 1 the Trip's real today hasn't arrived, so
    // there's nothing to load or write. The day journaled is today clamped
    // to the Trip's own range — the same day this Phase treats as "today".
    stopsPromise.then((rows) => {
      const tripToday = tripTodayISO(rows);
      return userId && tripToday >= startDate
        ? loadTodaysJournal(tripId, effectiveTodayISO(tripToday, startDate, endDate), userId)
        : null;
    }),
  ]);

  // Trip's reference-timezone "today" (things-to-fix P0-2) — the fetched
  // stops already carry timezone/arriveDate/departDate, in sortOrder order.
  // Every plan-entity query above is scoped to the real plan (REAL_PLAN)
  // — dated views follow the real plan (CONTEXT.md; consistent with
  // calendar/day/print/summary) — so `stops` is already fork-free here.
  const today = tripTodayISO(stops);
  const effectiveDate = effectiveTodayISO(today, startDate, endDate);

  const isBeforeTrip = today < startDate;
  const isAfterTrip = today > endDate;
  const isWithinTrip = today >= startDate && today <= endDate;

  const currentChapter = chapterForDate(effectiveDate, chapters);
  const dayNum = dayNumberInTrip(effectiveDate, startDate);

  // Today's Day title (CONTEXT.md "Day title", Task 5, spec §H) — only
  // today's is loaded here (not the whole plan); Task 17's desktop Today
  // tile takes it as a `dayTitle?: string` prop.
  const todaysDayTitle =
    titlesByDate(
      stops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })),
      dayTitleRows,
    ).get(effectiveDate)?.title ?? null;

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
      .map((e) => e as TransportDepartureEntry)
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
      ? thingsToDoAll
          .filter((t) => t.stopId === dayStop.id)
          .map(({ id, title, category, startTime, endTime }) => ({ id, title, category, startTime, endTime }))
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

  // The next departure, resolved for display (TransportCountdown on the
  // phone, the desktop Today tile).
  const nextTransport =
    nextTransportDep && nextTransportDep.transport.depAt
      ? {
          depAt: new Date(nextTransportDep.transport.depAt).toISOString(),
          depTimeLabel: nextTransportDep.depTimeLabel,
          depZone: zoneLabel(
            stops.find((s) => s.id === nextTransportDep.transport.fromStopId)?.timezone,
            effectiveDate,
          ),
          label: buildTransportLabel(nextTransportDep.transport),
        }
      : null;

  return {
    kind: "dated" as const,
    trip,
    // The desktop countdown tile's "at a glance" row (homeStats): the dated
    // Stops this Phase is built from, and every Chapter — dated and rough.
    glance: {
      stops: stops.map((s) => ({ countryCode: s.countryCode })),
      chapterCount: chapters.length,
    },
    startDate,
    endDate,
    today,
    effectiveDate,
    isBeforeTrip,
    isAfterTrip,
    isWithinTrip,
    currentChapter,
    dayNum,
    totalDays,
    todaysDayTitle,
    dayPlan,
    hasEntries,
    attachmentsByTarget,
    tonightAccom,
    nextTransport,
    effectiveStop,
    stopLocated,
    spend,
    homeCurrency,
    upcomingPayments,
    dayMapModel,
    itemDirections,
    freeForm,
    thingsToDo,
    wishlistIdeas,
    nearby,
    todaysJournal,
  };
}

export const loadTravellingHome = cache(loadTravellingHomeUncached);

export type TravellingHome = Awaited<ReturnType<typeof loadTravellingHomeUncached>>;
export type DatedTravellingHome = Extract<TravellingHome, { kind: "dated" }>;

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
