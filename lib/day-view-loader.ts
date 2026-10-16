/**
 * Day view loader (spec 2026-09-27 §C "Data"; card 3.M, NAV-05).
 *
 * `getDays` reads the carousel window — the day shown and its neighbours —
 * once: the shared rows through `readDayRows` (lib/day-reads.ts), plus this
 * view's own Costs (the edit dialogs pre-fill from them) and every
 * Traveller's Journal for the window's dates, in the same wave. Each date is
 * assembled by `buildDayModel` (lib/day-view-model.ts, shared with the
 * Travelling Home) and dressed for the page by `projectDayView`.
 * `getDayWeatherView` is separate so the page can await it inside a Suspense
 * boundary (DAY_VIEW §4) — weather never blocks the day's plan.
 *
 * Policy (not a BND-2 spelling exemption): the dated Day view always shows the
 * real plan and ignores `?plan=` — see architecture-sitrep-2026-09-22.md.
 */

import { db } from "@/lib/db";
import { addDays, daysBetween, formatDayLabel } from "@/lib/dates";
import { instantToZonedTime } from "@/lib/tz";
import { tripTodayISO } from "@/lib/trip-today";
import { orderDayEntries, type DayPlan, type OrderedDay } from "@/lib/itinerary";
import type { DayMapModel, ItemDirections } from "@/lib/day-map";
import type { NearbyResult } from "@/lib/nearby";
import { flagTightConnections } from "@/lib/flags";
import { daylight, utcHmToZone, type DaylightView } from "@/lib/daylight";
import { getDayWeather, type DayWeather } from "@/lib/weather";
import { getWeatherTheme, type WeatherTheme } from "@/lib/weather/theme";
import { zoneLabel } from "@/lib/time-display";
import { computeTripPhase, type TripPhase } from "@/lib/trip-phase";
import { canWriteJournal } from "@/lib/journal-window";
import { groupJournalDayByAuthor } from "@/lib/journal-authors";
import { itemPhotoUrl } from "@/lib/item-photo";
import { readDayRows, type DayReadContext } from "@/lib/day-reads";
import {
  buildDayModel,
  dayHeading,
  dayEyebrow,
  daySubLine,
  nightOfStay,
  tripDays,
  stopLine,
  dayIdeasRows,
  forecastOpensOn as forecastOpensOnFor,
  type DayModel,
  type DayRows,
  type StopLine,
  type SubLineInput,
} from "@/lib/day-view-model";
import { REAL_PLAN } from "@/lib/plan-scope";
import { TRAVELLER_SELECT, type TravellerLike } from "@/lib/traveller";
import type { TransportMode } from "@/lib/enum-values";
import type { DayEntryEditor } from "@/lib/plan-entity-views";
import type { AttachmentView } from "@/lib/attachment-view";
import type { CostRow } from "@/lib/money/cost-row";

/** Links from nearby days still resolve within this many days of the trip's ends (clamped). */
const BUFFER_DAYS = 2;

export interface DayViewData {
  tripId: string;
  viewerId: string;
  trip: { name: string; startDate: string; endDate: string; homeCurrency: string; homeName: string | null; homeTimezone: string | null };
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
  stop: {
    id: string;
    name: string;
    country: string | null;
    countryCode: string | null;
    timezone: string;
    lat: number | null;
    lng: number | null;
    arriveDate: string;
    departDate: string;
  } | null;
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
  stopOptions: Array<{ id: string; name: string; arriveDate: string | null; departDate: string | null; timezone: string | null; sortOrder: number }>;
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
  strip: { dates: Array<{ iso: string; count: number; isCurrent: boolean; isToday: boolean }>; line: StopLine };
  journal: {
    open: boolean;
    mine: { body: string; updatedAt: Date | null; photo: AttachmentView | null; extraPhotos: AttachmentView[]; hiddenFromShares: boolean } | null;
    others: Array<{ authorId: string; body: string; updatedAt: Date; author: TravellerLike | null; photos: AttachmentView[] }>;
  };
  feasibility: Array<{ severity: string; message: string }>;
  /** For the weather Suspense island; null when the day has no located Stop. */
  weatherInput: { lat: number; lng: number; timezone: string } | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
type DayResult = DayViewData | "invalid" | "out-of-range" | "dateless";

/** A well-formed date clamped into the Trip, or "out-of-range" beyond the buffer. */
function clampDate(date: string, startDate: string, endDate: string): string | "out-of-range" {
  if (date < addDays(startDate, -BUFFER_DAYS) || date > addDays(endDate, BUFFER_DAYS)) return "out-of-range";
  return date < startDate ? startDate : date > endDate ? endDate : date;
}

/**
 * This view's own reads, in readDayRows's wave: the Costs on the day's
 * editable entities (the edit dialogs pre-fill from them) and every
 * Traveller's Journal entry and photos for the window's dates (ARCH-DAT-6),
 * one `in` list each. Null when the Trip has no end: the Day view needs both.
 */
async function readWindowExtras(ctx: DayReadContext, dates: readonly string[]) {
  if (ctx.trip.endDate === null) return null;
  const shown = [
    ...new Set(
      dates
        .filter((d) => ISO_DATE.test(d))
        .map((d) => clampDate(d, ctx.startDate, ctx.endDate))
        .filter((d) => d !== "out-of-range"),
    ),
  ];
  const [costs, journalEntries, journalPhotos] = await Promise.all([
    db.cost.findMany({
      where: { tripId: ctx.tripId, ...REAL_PLAN, ownerType: { in: ["ITEM", "TRANSPORT", "ACCOMMODATION"] }, ownerId: { not: null }, ...ctx.visibility.where.cost },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, costMinor: true, paidMinor: true, currency: true, rateToHome: true, paidAt: true, dueDate: true,
        ownerType: true, ownerId: true, label: true, category: true, settlement: true,
      },
    }),
    db.journalEntry.findMany({
      where: { tripId: ctx.tripId, date: { in: shown } },
      orderBy: { createdAt: "asc" },
      select: { id: true, body: true, date: true, authorId: true, updatedAt: true, hiddenFromShares: true, author: { select: TRAVELLER_SELECT } },
    }),
    db.attachment.findMany({
      where: { tripId: ctx.tripId, targetType: "JOURNAL", targetId: { in: shown } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, filename: true, title: true, mime: true, size: true, url: true, uploadedById: true, createdAt: true, targetId: true,
        // Attributes a photo-only co-Traveller (no JournalEntry row).
        uploadedBy: { select: TRAVELLER_SELECT },
      },
    }),
  ]);
  return { costs, journalEntries, journalPhotos };
}
type WindowExtras = NonNullable<Awaited<ReturnType<typeof readWindowExtras>>>;

/**
 * The Day view for each of `dates`, in order (NAV-05): the carousel's day
 * shown and its neighbours from one read. A malformed date is "invalid", one
 * beyond the 2-day buffer "out-of-range"; a date just outside the Trip clamps
 * to its end (the page drops a neighbour that clamped onto the day shown).
 */
export async function getDays(tripId: string, dates: readonly string[], viewerId: string): Promise<DayResult[]> {
  const wellFormed = (d: string) => ISO_DATE.test(d);
  if (!dates.some(wellFormed)) return dates.map(() => "invalid" as const);

  const read = await readDayRows(tripId, viewerId, (ctx) => readWindowExtras(ctx, dates));
  if (read === "missing") return dates.map(() => "invalid" as const);
  if (read === "dateless" || read.alongside === null) return dates.map((d) => (wellFormed(d) ? ("dateless" as const) : ("invalid" as const)));

  const { rows, alongside } = read;
  const shared = shareAcrossDays(tripId, rows, alongside.costs);
  return dates.map((d): DayResult => {
    if (!wellFormed(d)) return "invalid";
    const date = clampDate(d, rows.startDate, rows.endDate);
    if (date === "out-of-range") return date;
    const model = buildDayModel(rows, date);
    // Unreachable after the clamp; kept so a projection change can't crash the page.
    if (!model.dayPlan) return "out-of-range";
    return projectDayView(rows, { ...model, dayPlan: model.dayPlan }, shared, {
      viewerId,
      journalEntries: alongside.journalEntries.filter((e) => e.date === date),
      journalPhotos: alongside.journalPhotos.filter((p) => p.targetId === date),
    });
  });
}

/** What every day of one window shares — built once per getDays call. */
function shareAcrossDays(tripId: string, rows: DayRows, costs: CostRow[]) {
  const { trip, stops, items, transports } = rows;
  const stopById = new Map(stops.map((s) => [s.id, s]));
  const costsByOwner: Record<string, CostRow[]> = {};
  for (const c of costs) if (c.ownerId) (costsByOwner[c.ownerId] ??= []).push(c);
  // The strip's dots count what the day shows: the dated Items already read, placeholders included.
  const itemsByDate = new Map<string, number>();
  for (const it of items) if (it.date) itemsByDate.set(it.date, (itemsByDate.get(it.date) ?? 0) + 1);
  const windowDates = tripDays(rows.startDate, rows.endDate);
  const attachmentsById = new Map(rows.attachments.map((a) => [a.id, { url: a.url }]));
  const editorBase: Omit<DayEntryEditor, "accommodations"> = {
    tripId,
    stops: stops.map((s) => ({ id: s.id, name: s.name, timezone: s.timezone, arriveDate: s.arriveDate })),
    homeCurrency: trip.homeCurrency,
    homeBaseName: trip.homeName,
    homeTimezone: trip.homeTimezone,
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
    costsByOwner,
  };
  return {
    today: tripTodayISO(stops),
    stopById,
    itemsByDate,
    windowDates,
    editorBase,
    stopOptions: stops.map((s) => ({ id: s.id, name: s.name, arriveDate: s.arriveDate, departDate: s.departDate, timezone: s.timezone, sortOrder: s.sortOrder })),
    line: stopLine({
      days: windowDates,
      stops: stops.map((s) => ({ id: s.id, name: s.name, arriveDate: s.arriveDate!, departDate: s.departDate!, sortOrder: s.sortOrder })),
      transports: transports.map((t) => ({
        fromStopId: t.fromStopId, toStopId: t.toStopId, depPlace: t.depPlace, arrPlace: t.arrPlace,
        depIsHome: t.depIsHome, arrIsHome: t.arrIsHome, mode: t.mode as TransportMode,
      })),
      homeName: trip.homeName,
      roundTrip: trip.roundTrip ?? true,
    }),
  };
}
type SharedDays = ReturnType<typeof shareAcrossDays>;

/** Pure: the Day view for one date, from its model, the window's shared parts and its Journal rows. */
function projectDayView(
  rows: DayRows,
  model: DayModel & { dayPlan: DayPlan },
  shared: SharedDays,
  day: { viewerId: string; journalEntries: WindowExtras["journalEntries"]; journalPhotos: WindowExtras["journalPhotos"] },
): DayViewData {
  const { trip, startDate, endDate, items, transports } = rows;
  const { date, dayPlan, dayStop, freeForm, hasEntries, accommodations, tonight: bed } = model;
  const { stopById, today } = shared;

  const editor: DayEntryEditor = {
    ...shared.editorBase,
    accommodations: Object.fromEntries(
      accommodations.map((a) => {
        const st = stopById.get(a.stopId);
        return [a.id, { accommodation: a, stopDateRange: { arriveDate: st?.arriveDate ?? a.checkIn, departDate: st?.departDate ?? a.checkOut } }];
      }),
    ),
  };

  const tonightNight = bed ? nightOfStay(date, bed.checkIn, bed.checkOut) : null;
  const tonight =
    bed && tonightNight
      ? {
          id: bed.id, name: bed.name, nightOf: tonightNight, checkOut: bed.checkOut, address: bed.address,
          confirmation: bed.confirmation, checkInTime: bed.checkInTime, checkOutTime: bed.checkOutTime,
          notes: bed.notes, lat: bed.lat, lng: bed.lng,
        }
      : null;

  // ── Phase and the Journal window ──
  const phase = computeTripPhase({ startDate, endDate, today });
  const journalOpen = canWriteJournal({ startDate, endDate, today, date });
  const journalSlots = groupJournalDayByAuthor({
    entries: day.journalEntries,
    photos: day.journalPhotos,
    viewerId: day.viewerId,
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
  const travelDay = dayPlan.transportEntries.length > 0;

  // ── Day ideas — every phase (ADR 0044 amendment) ──
  const ideas =
    freeForm && dayStop
      ? dayIdeasRows({ stopName: dayStop.name, thingsToDo: model.thingsToDo, wishlist: model.ideasWishlist })
      : { rows: [], all: [], more: 0, eyebrow: null };

  // ── Header: heading, eyebrow, sub line ──
  const eyebrow = dayEyebrow({
    dayNumber: model.dayNumber,
    totalDays: model.totalDays,
    chapterName: model.chapter?.name ?? null,
    country: dayStop?.country ?? null,
    travelDay,
  });
  const dep = dayPlan.transportEntries.find((e) => e.kind === "transport-departure");
  const home = trip.homeName ?? "Home";
  const travel: SubLineInput["travel"] = dep
    ? {
        from: stopById.get(dep.transport.fromStopId ?? "")?.name ?? dep.transport.depPlace ?? home,
        to: stopById.get(dep.transport.toStopId ?? "")?.name ?? dep.transport.arrPlace ?? home,
        // A Home arrival has no toStop of its own (CONTEXT.md "Home base"): its
        // zone is the Trip's own `homeTimezone` when set. Otherwise a leg home
        // has no toStop and so no known zone — no "→ UTC".
        toZone:
          dep.transport.arrIsHome && trip.homeTimezone
            ? zoneLabel(trip.homeTimezone, date)
            : dep.transport.toStopId
              ? zoneLabel(stopById.get(dep.transport.toStopId)?.timezone, date)
              : null,
      }
    : null;
  const subLineBase = {
    stopName: dayStop?.name ?? null,
    country: dayStop?.country ?? null,
    // Only a Stop with a zone set shows one (as the old page did).
    zone: dayStop?.timezone ? zoneLabel(dayStop.timezone, date) : null,
    nightOf: tonight?.nightOf ?? null,
    travel,
  };

  // ── Strip: every day of the Trip (spec 2026-09-28 D1) ──
  // Dots count what the day's plan card counts ("3 things"): the day's Items
  // plus its Transport legs and check-ins/outs from the whole-Trip itinerary.
  const itineraryByDate = new Map(model.itinerary.map((d) => [d.dateISO, d]));
  const nonItemCount = (iso: string) => {
    const d = itineraryByDate.get(iso);
    return d ? d.transportEntries.length + d.accommodationEntries.length : 0;
  };
  const strip: DayViewData["strip"] = {
    dates: shared.windowDates.map((iso) => ({
      iso,
      count: (shared.itemsByDate.get(iso) ?? 0) + nonItemCount(iso),
      isCurrent: iso === date,
      isToday: iso === today,
    })),
    line: shared.line,
  };

  const feasibility = flagTightConnections(
    items
      .filter((it) => it.date === date)
      .map((it) => ({ id: it.id, stopId: it.stopId, date: it.date, startTime: it.startTime, endTime: it.endTime, lat: it.lat, lng: it.lng })),
    transports.map((t) => ({ id: t.id, fromStopId: t.fromStopId, toStopId: t.toStopId, mode: t.mode })),
    { windingFactor: 1.5, avgSpeedKph: 80 },
  ).map((f) => ({ severity: f.severity, message: f.message }));

  const stopTimezone = dayStop?.timezone ?? "UTC";
  const isFirst = date === startDate;
  const isLast = date === endDate;

  return {
    tripId: shared.editorBase.tripId,
    viewerId: day.viewerId,
    trip: { name: trip.name, startDate, endDate, homeCurrency: trip.homeCurrency, homeName: trip.homeName, homeTimezone: trip.homeTimezone },
    date,
    today,
    isToday: today === date,
    phase,
    dayNumber: model.dayNumber,
    totalDays: model.totalDays,
    heading: dayHeading(date, startDate, endDate),
    eyebrow,
    subLine: daySubLine({ ...subLineBase, compact: false }),
    subLineCompact: daySubLine({ ...subLineBase, compact: true }),
    isFirst,
    isLast,
    prevDate: isFirst ? null : addDays(date, -1),
    nextDate: isLast ? null : addDays(date, 1),
    stop: dayStop
      ? {
          id: dayStop.id, name: dayStop.name, country: dayStop.country, countryCode: dayStop.countryCode,
          timezone: stopTimezone, lat: dayStop.lat, lng: dayStop.lng,
          // The read keeps dated Stops only (lib/day-reads.ts).
          arriveDate: dayStop.arriveDate!, departDate: dayStop.departDate!,
        }
      : null,
    travelDay,
    dayTitle: model.dayTitle?.title ?? null,
    dayTitleStopId: model.dayTitle?.stopId ?? dayStop?.id ?? null,
    plan: dayPlan,
    ordered,
    hasEntries,
    freeForm,
    planCount: ordered.entries.length + ordered.anytime.length,
    editor,
    itemDirections: model.itemDirections,
    dayMap: model.dayMap,
    attachmentsByTarget: model.attachmentsByTarget,
    stopOptions: shared.stopOptions,
    ideas,
    nearby: model.nearby,
    tonight,
    strip,
    journal,
    feasibility,
    weatherInput: dayStop?.lat != null && dayStop?.lng != null ? { lat: dayStop.lat, lng: dayStop.lng, timezone: stopTimezone } : null,
  };
}

/** Bridge for the Day page until 3.M.4 moves it onto getDays. */
export const getDay = async (tripId: string, date: string, viewerId: string) => (await getDays(tripId, [date], viewerId))[0];

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
