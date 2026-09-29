/**
 * Day view loader (spec 2026-09-27 §C "Data").
 *
 * `getDay` runs every query the Day view needs and assembles the view data
 * from the pure helpers in `lib/day-view-model.ts` and the itinerary
 * projection. `getDayWeatherView` is separate so the page can await it inside
 * a Suspense boundary (DAY_VIEW §4) — weather never blocks the day's plan.
 *
 * Policy (not a BND-2 spelling exemption): the dated Day view always shows the
 * real plan and ignores `?plan=` — see architecture-sitrep-2026-09-22.md.
 */

import { db } from "@/lib/db";
import { addDays, dayNumberInTrip, daysBetween, formatDayLabel } from "@/lib/dates";
import { loadDayTitles } from "@/lib/day-titles-loader";
import { instantToZonedTime } from "@/lib/tz";
import { tripTodayISO } from "@/lib/trip-today";
import { buildItinerary, orderDayEntries, isFreeFormDay, dayHasEntries, type DayPlan, type OrderedDay } from "@/lib/itinerary";
import { buildDayMapModel, buildItemDirections, type DayMapModel } from "@/lib/day-map";
import { nearbyWishlistItems, dayIdeasWishlist, type NearbyResult } from "@/lib/nearby";
import { flagTightConnections } from "@/lib/flags";
import { daylight, utcHmToZone } from "@/lib/daylight";
import { getDayWeather, type DayWeather } from "@/lib/weather";
import { getWeatherTheme, type WeatherTheme } from "@/lib/weather/theme";
import { zoneLabel } from "@/lib/time-display";
import { computeTripPhase, type TripPhase } from "@/lib/trip-phase";
import { canWriteJournal } from "@/lib/journal-window";
import { groupJournalDayByAuthor } from "@/lib/journal-authors";
import { itemPhotoUrl } from "@/lib/item-photo";
import { chapterForDate } from "@/lib/chapters";
import {
  dayHeading,
  dayEyebrow,
  daySubLine,
  nightOfStay,
  tripDays,
  citySegments,
  dayIdeasRows,
  forecastOpensOn as forecastOpensOnFor,
  type CitySegment,
  type SubLineInput,
} from "@/lib/day-view-model";
import { THINGS_TO_DO_WHERE, WISHLIST_IDEA_WHERE, REAL_PLAN } from "@/lib/plan-scope";
import { TRAVELLER_SELECT, type TravellerLike } from "@/lib/traveller";
import type { TransportMode } from "@/lib/enums";
import type { DayEntryEditor } from "@/components/trip/day-entry-link";
import type { AttachmentView } from "@/components/trip/attachment-list";
import type { ItemDirections } from "@/components/trip/timeline";
import type { DaylightView } from "@/components/weather/daylight-bar";
import type { CostRow } from "@/server/actions/costs";

/** Links from nearby days still resolve within this many days of the trip's ends (clamped). */
const BUFFER_DAYS = 2;

export interface DayViewData {
  tripId: string;
  viewerId: string;
  trip: { name: string; startDate: string; endDate: string; homeCurrency: string; homeName: string | null };
  /** The effective (clamped) date. */
  date: string;
  /** Today in the trip's zone. */
  today: string;
  isToday: boolean;
  phase: TripPhase;
  dayNumber: number;
  totalDays: number;
  heading: string;
  eyebrow: string;
  subLine: string;
  subLineCompact: string;
  isFirst: boolean;
  isLast: boolean;
  prevDate: string | null;
  nextDate: string | null;
  stop: { id: string; name: string; country: string | null; countryCode: string | null; timezone: string; lat: number | null; lng: number | null } | null;
  travelDay: boolean;
  dayTitle: string | null;
  /** The Stop that owns the title, or — when there is none — the Stop the Day view treats as the day's (the arriving one on a Changeover day); null on a gap day. */
  dayTitleStopId: string | null;
  plan: DayPlan;
  ordered: OrderedDay;
  hasEntries: boolean;
  freeForm: boolean;
  planCount: number;
  editor: DayEntryEditor;
  itemDirections: Record<string, ItemDirections>;
  /** The Day map's model (CONTEXT.md "Day map"); the panel stays collapsed until opened. */
  dayMap: DayMapModel;
  attachmentsByTarget: Record<string, AttachmentView[]>;
  stopOptions: Array<{ id: string; name: string; arriveDate: string | null }>;
  /** Day ideas — every phase (ADR 0044 amendment). */
  ideas: ReturnType<typeof dayIdeasRows>;
  /** Planned-day nearby rail (unchanged behaviour). */
  nearby: NearbyResult[];
  tonight: {
    id: string;
    name: string;
    nightOf: { night: number; of: number };
    checkOut: string;
    address: string | null;
    confirmation: string | null;
    checkInTime: string | null;
    checkOutTime: string | null;
    notes: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  strip: { dates: Array<{ iso: string; count: number; isCurrent: boolean; isToday: boolean }>; segments: CitySegment[] };
  journal: {
    open: boolean;
    mine: { body: string; updatedAt: Date | null; photo: AttachmentView | null; extraPhotos: AttachmentView[]; hiddenFromShares: boolean } | null;
    others: Array<{ authorId: string; body: string; updatedAt: Date; author: TravellerLike | null; photos: AttachmentView[] }>;
  };
  feasibility: Array<{ severity: string; message: string }>;
  /** For the weather Suspense island; null when the day has no located Stop. */
  weatherInput: { lat: number; lng: number; timezone: string } | null;
}

export async function getDay(
  tripId: string,
  dateParam: string,
  viewerId: string,
): Promise<DayViewData | "invalid" | "out-of-range" | "dateless"> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return "invalid";

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { startDate: true, endDate: true, name: true, homeCurrency: true, homeName: true, chaptersEnabled: true },
  });
  // The caller has already checked access; a missing row is treated as a bad link.
  if (!trip) return "invalid";
  if (!trip.startDate || !trip.endDate) return "dateless";
  const startDate = trip.startDate;
  const endDate = trip.endDate;

  if (dateParam < addDays(startDate, -BUFFER_DAYS) || dateParam > addDays(endDate, BUFFER_DAYS)) return "out-of-range";
  const effectiveDate = dateParam < startDate ? startDate : dateParam > endDate ? endDate : dateParam;

  const windowDates = tripDays(startDate, endDate);

  const [stops, items, transports, accommodations, journalEntries, journalPhotos, wishlist, allAttachments, costs, chapters, counts] =
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
          hiddenFromShares: true,
          photoAttachmentId: true,
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
          sortOrder: true,
          anchorStopId: true,
          depIsHome: true,
          arrIsHome: true,
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
      // Every Traveller's entry for this date (ARCH-DAT-6) — split into
      // "mine" (editable) and "others" (read-only) below.
      db.journalEntry.findMany({
        where: { tripId, date: effectiveDate },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          authorId: true,
          updatedAt: true,
          hiddenFromShares: true,
          author: { select: TRAVELLER_SELECT },
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
          // Attributes a photo-only co-Traveller (no JournalEntry row).
          uploadedBy: { select: TRAVELLER_SELECT },
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
      // Costs on the day's editable entities — the edit dialogs pre-fill from them.
      db.cost.findMany({
        where: { tripId, ...REAL_PLAN, ownerType: { in: ["ITEM", "TRANSPORT", "ACCOMMODATION"] }, ownerId: { not: null } },
        orderBy: { createdAt: "asc" },
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
      // The eyebrow names the day's Chapter only when Chapters are on.
      trip.chaptersEnabled
        ? db.chapter.findMany({
            where: { tripId, ...REAL_PLAN },
            select: { id: true, name: true, colour: true, startDate: true, endDate: true, sortOrder: true },
          })
        : Promise.resolve([]),
      // The strip's per-day dot counts.
      db.item.groupBy({
        by: ["date"],
        where: { tripId, ...REAL_PLAN, date: { gte: startDate, lte: endDate } },
        _count: { _all: true },
      }),
    ]);

  // CONTEXT.md "Item photo" — keyed by the Attachment's own id.
  const attachmentsById = new Map(allAttachments.map((a) => [a.id, { url: a.url }]));

  const dayTitleEntry =
    (await loadDayTitles(stops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })))).get(effectiveDate) ?? null;
  const dayTitleText = dayTitleEntry?.title ?? null;

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
      hiddenFromShares: item.hiddenFromShares,
      photoUrl: itemPhotoUrl(item, attachmentsById),
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

  const dayPlan = itinerary.find((d) => d.dateISO === effectiveDate);
  // Unreachable after the clamp; kept so a projection change can't crash the page.
  if (!dayPlan) return "out-of-range";

  const stopOptions = stops.map((s) => ({ id: s.id, name: s.name, arriveDate: s.arriveDate }));

  // ── Edit context for the plan rows (click a title → its edit dialog) ──
  const stopById = new Map(stops.map((s) => [s.id, s]));
  const costsByOwner: Record<string, CostRow[]> = {};
  for (const c of costs) if (c.ownerId) (costsByOwner[c.ownerId] ??= []).push(c);
  const editor: DayEntryEditor = {
    tripId,
    stops: stops.map((s) => ({ id: s.id, name: s.name, timezone: s.timezone, arriveDate: s.arriveDate })),
    homeCurrency: trip.homeCurrency,
    homeBaseName: trip.homeName,
    items: Object.fromEntries(items.map((i) => [i.id, { ...i, photoUrl: itemPhotoUrl(i, attachmentsById) }])),
    transports: Object.fromEntries(
      transports.map((t) => [
        t.id,
        {
          ...t,
          mode: t.mode as TransportMode,
          fromStopName: t.fromStopId ? (stopById.get(t.fromStopId)?.name ?? null) : null,
          toStopName: t.toStopId ? (stopById.get(t.toStopId)?.name ?? null) : null,
          fromStopTimezone: t.fromStopId ? (stopById.get(t.fromStopId)?.timezone ?? null) : null,
          toStopTimezone: t.toStopId ? (stopById.get(t.toStopId)?.timezone ?? null) : null,
        },
      ]),
    ),
    accommodations: Object.fromEntries(
      accommodations.map((a) => {
        const st = stopById.get(a.stopId);
        return [
          a.id,
          {
            accommodation: a,
            stopDateRange: { arriveDate: st?.arriveDate ?? a.checkIn, departDate: st?.departDate ?? a.checkOut },
          },
        ];
      }),
    ),
    costsByOwner,
  };

  // ── Attachments by target id (entity ids are globally-unique cuids) ──
  const attachmentsByTarget = allAttachments.reduce<Record<string, typeof allAttachments>>((acc, att) => {
    if (att.targetId) (acc[att.targetId] ??= []).push(att);
    return acc;
  }, {});

  // ── Day-map model ──
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
  const tonightRaw = accommodations.find((a) => a.checkIn <= effectiveDate && a.checkOut > effectiveDate) ?? null;
  const dayAccommodation = tonightRaw
    ? { id: tonightRaw.id, name: tonightRaw.name, lat: tonightRaw.lat, lng: tonightRaw.lng, address: tonightRaw.address }
    : null;
  const tonightNight = tonightRaw ? nightOfStay(effectiveDate, tonightRaw.checkIn, tonightRaw.checkOut) : null;
  const tonight =
    tonightRaw && tonightNight
      ? {
          id: tonightRaw.id,
          name: tonightRaw.name,
          nightOf: tonightNight,
          checkOut: tonightRaw.checkOut,
          address: tonightRaw.address,
          confirmation: tonightRaw.confirmation,
          checkInTime: tonightRaw.checkInTime,
          checkOutTime: tonightRaw.checkOutTime,
          notes: tonightRaw.notes,
          lat: tonightRaw.lat,
          lng: tonightRaw.lng,
        }
      : null;

  const dayTransportIds = new Set(dayPlan.transportEntries.map((e) => e.transport.id));
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

  // ── Nearby Wishlist rail (planned days): located items + tonight's bed ──
  const nearbyAnchors = [
    ...dayItems.filter((i) => i.lat != null && i.lng != null).map((i) => ({ lat: i.lat!, lng: i.lng! })),
    ...(dayAccommodation?.lat != null && dayAccommodation?.lng != null
      ? [{ lat: dayAccommodation.lat, lng: dayAccommodation.lng }]
      : []),
  ];
  const nearby = nearbyWishlistItems({
    anchors: nearbyAnchors,
    candidates: wishlist
      .filter((i) => i.lat != null && i.lng != null)
      .map((i) => ({ id: i.id, title: i.title, category: i.category, lat: i.lat!, lng: i.lng! })),
  });

  // ── Phase, today and the Journal window ──
  const today = tripTodayISO(stops);
  const phase = computeTripPhase({ startDate, endDate, today });
  const journalOpen = canWriteJournal({ startDate, endDate, today, date: effectiveDate });
  const journalSlots = groupJournalDayByAuthor({
    entries: journalEntries,
    photos: journalPhotos,
    viewerId,
    includeViewerSlot: journalOpen,
  });
  // The viewer's slot feeds the editor only when the day is writable; on a
  // day still ahead, any legacy content of theirs shows read-only.
  const mySlot = journalOpen ? journalSlots.find((s) => s.isViewer) : undefined;
  const [myPhoto = null, ...myExtraPhotos] = mySlot?.photos ?? [];
  const journal: DayViewData["journal"] = {
    open: journalOpen,
    mine: journalOpen
      ? {
          body: mySlot?.entry?.body ?? "",
          updatedAt: mySlot?.entry?.updatedAt ?? null,
          photo: myPhoto,
          extraPhotos: myExtraPhotos,
          hiddenFromShares: mySlot?.entry?.hiddenFromShares ?? false,
        }
      : null,
    others: journalSlots
      .filter((s) => s !== mySlot)
      .map((slot) => ({
        authorId: slot.authorId,
        body: slot.entry?.body ?? "",
        updatedAt: slot.entry?.updatedAt ?? slot.photos[0]?.createdAt ?? new Date(0),
        author: slot.entry?.author ?? slot.photos[0]?.uploadedBy ?? null,
        photos: slot.photos,
      })),
  };

  // ── The day's shape ──
  const ordered = orderDayEntries(dayPlan);
  const freeForm = isFreeFormDay(dayPlan);
  const hasEntries = dayHasEntries(dayPlan);
  const dayStop = stops.find((s) => s.id === dayPlan.stop?.id) ?? null;
  const travelDay = dayPlan.transportEntries.length > 0;

  // ── Day ideas — every phase now (ADR 0044 amendment) ──
  const thingsToDo =
    freeForm && dayStop
      ? await db.item.findMany({
          where: { tripId, ...REAL_PLAN, ...THINGS_TO_DO_WHERE, stopId: dayStop.id },
          orderBy: { sortOrder: "asc" },
          select: { id: true, title: true, category: true, startTime: true },
        })
      : [];
  const ideas =
    freeForm && dayStop
      ? dayIdeasRows({
          stopName: dayStop.name,
          thingsToDo,
          wishlist: dayIdeasWishlist({
            stop: { lat: dayStop.lat, lng: dayStop.lng, countryCode: dayStop.countryCode },
            candidates: wishlist,
          }),
        })
      : { rows: [], all: [], more: 0, eyebrow: null };

  // ── Header: heading, eyebrow, sub line ──
  const dayNumber = dayNumberInTrip(effectiveDate, startDate);
  const totalDays = daysBetween(startDate, endDate) + 1;
  const chapter = chapters.length ? chapterForDate(effectiveDate, chapters) : null;
  const eyebrow = dayEyebrow({
    dayNumber,
    totalDays,
    chapterName: chapter?.name ?? null,
    country: dayStop?.country ?? null,
    travelDay,
  });
  const dep = dayPlan.transportEntries.find((e) => e.kind === "transport-departure");
  const home = trip.homeName ?? "Home";
  const travel: SubLineInput["travel"] = dep
    ? {
        from: stopById.get(dep.transport.fromStopId ?? "")?.name ?? dep.transport.depPlace ?? home,
        to: stopById.get(dep.transport.toStopId ?? "")?.name ?? dep.transport.arrPlace ?? home,
        // A leg home has no toStop and so no known zone — no "→ UTC".
        toZone: dep.transport.toStopId ? zoneLabel(stopById.get(dep.transport.toStopId)?.timezone, effectiveDate) : null,
      }
    : null;
  const subLineBase = {
    stopName: dayStop?.name ?? null,
    country: dayStop?.country ?? null,
    // Only a Stop with a zone set shows one (as the old page did).
    zone: dayStop?.timezone ? zoneLabel(dayStop.timezone, effectiveDate) : null,
    nightOf: tonight?.nightOf ?? null,
    travel,
  };

  // ── Strip: every day of the Trip (spec 2026-09-28 D1) ──
  // Dots count what the day's plan card counts ("3 things"): the grouped Item
  // counts plus the day's Transport legs and check-ins/outs from the
  // itinerary projection (already built for the whole trip).
  const countByDate = new Map(counts.map((c) => [c.date as string, c._count._all]));
  const itineraryByDate = new Map(itinerary.map((d) => [d.dateISO, d]));
  const nonItemCount = (iso: string) => {
    const d = itineraryByDate.get(iso);
    return d ? d.transportEntries.length + d.accommodationEntries.length : 0;
  };
  const strip: DayViewData["strip"] = {
    dates: windowDates.map((iso) => ({
      iso,
      count: (countByDate.get(iso) ?? 0) + nonItemCount(iso),
      isCurrent: iso === effectiveDate,
      isToday: iso === today,
    })),
    segments: citySegments(
      windowDates,
      stops.map((s) => ({ name: s.name, arriveDate: s.arriveDate!, departDate: s.departDate!, sortOrder: s.sortOrder })),
    ),
  };

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
    transports.map((t) => ({ id: t.id, fromStopId: t.fromStopId, toStopId: t.toStopId, mode: t.mode })),
    { windingFactor: 1.5, avgSpeedKph: 80 },
  ).map((f) => ({ severity: f.severity, message: f.message }));

  const stopTimezone = dayStop?.timezone ?? "UTC";
  const isFirst = effectiveDate === startDate;
  const isLast = effectiveDate === endDate;

  return {
    tripId,
    viewerId,
    trip: { name: trip.name, startDate, endDate, homeCurrency: trip.homeCurrency, homeName: trip.homeName },
    date: effectiveDate,
    today,
    isToday: today === effectiveDate,
    phase,
    dayNumber,
    totalDays,
    heading: dayHeading(effectiveDate, startDate, endDate),
    eyebrow,
    subLine: daySubLine({ ...subLineBase, compact: false }),
    subLineCompact: daySubLine({ ...subLineBase, compact: true }),
    isFirst,
    isLast,
    prevDate: isFirst ? null : addDays(effectiveDate, -1),
    nextDate: isLast ? null : addDays(effectiveDate, 1),
    stop: dayStop
      ? {
          id: dayStop.id,
          name: dayStop.name,
          country: dayStop.country,
          countryCode: dayStop.countryCode,
          timezone: stopTimezone,
          lat: dayStop.lat,
          lng: dayStop.lng,
        }
      : null,
    travelDay,
    dayTitle: dayTitleText,
    dayTitleStopId: dayTitleEntry?.stopId ?? dayStop?.id ?? null,
    plan: dayPlan,
    ordered,
    hasEntries,
    freeForm,
    planCount: ordered.entries.length + ordered.anytime.length,
    editor,
    itemDirections,
    dayMap: dayMapModel,
    attachmentsByTarget,
    stopOptions,
    ideas,
    nearby,
    tonight,
    strip,
    journal,
    feasibility,
    weatherInput:
      dayStop?.lat != null && dayStop?.lng != null
        ? { lat: dayStop.lat, lng: dayStop.lng, timezone: stopTimezone }
        : null,
  };
}

/** Separate, awaited inside a Suspense boundary (DAY_VIEW §4). */
export interface DayWeatherView {
  theme: WeatherTheme;
  day: DayWeather | null;
  daylight: DaylightView;
  nowLocal: string | null;
  forecastOpensOn: string | null;
  dateLabel: string;
  placeName: string;
}

export async function getDayWeatherView(i: {
  lat: number;
  lng: number;
  timezone: string;
  dateISO: string;
  today: string;
  placeName: string;
}): Promise<DayWeatherView | null> {
  const { lat, lng, timezone, dateISO, today, placeName } = i;
  const dateLabel = formatDayLabel(dateISO);
  const daysOut = daysBetween(today, dateISO);
  const isToday = daysOut === 0;

  const day = await getDayWeather({ lat, lng, dateISO, today, withCurrent: isToday });
  // formatDayLabel is "Sat 12 Dec" — the month is its third word.
  const theme = getWeatherTheme({ day, daysOut, isToday, monthShort: dateLabel.split(" ")[2] });
  if (!theme) return null;

  // Sunrise/sunset come from lib/daylight.ts (NOAA, offline — ADR 0015), in the Stop's zone.
  const dl = daylight(lat, lng, dateISO);
  const daylightView: DaylightView = {
    sunrise: dl.sunriseUTC != null ? utcHmToZone(dateISO, dl.sunriseUTC, timezone) : null,
    sunset: dl.sunsetUTC != null ? utcHmToZone(dateISO, dl.sunsetUTC, timezone) : null,
    dayLengthMin: dl.dayLengthMin,
    polarDay: dl.polarDay,
    polarNight: dl.polarNight,
  };

  return {
    theme,
    day,
    daylight: daylightView,
    nowLocal: isToday ? instantToZonedTime(new Date(), timezone) : null,
    forecastOpensOn: theme.key === "too-far" ? forecastOpensOnFor(dateISO) : null,
    dateLabel,
    placeName,
  };
}
