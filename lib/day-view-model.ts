import { addDays, dayNumberInTrip, daysBetween, formatDayLabel, formatLongDate, nightsBetween } from "@/lib/dates";
import type { TransportMode } from "@/lib/enum-values";
import { findOutboundLeg, findReturnLeg } from "@/lib/home-base";
import { buildItinerary, pickDayPlan, isFreeFormDay, dayHasEntries, type DayPlan } from "@/lib/itinerary";
import { buildDayMapModel, buildItemDirections, type DayMapModel } from "@/lib/day-map";
import { nearbyWishlistItems, dayIdeasWishlist, type NearbyResult, type DayIdeaResult } from "@/lib/nearby";
import { chapterForDate } from "@/lib/chapters";
import { titlesByDate } from "@/lib/day-titles";
import { itemPhotoUrl } from "@/lib/item-photo";
import type { SurpriseView } from "@/lib/surprise";

export function dayHeading(dateISO: string, tripStart: string, tripEnd: string): string {
  const spansYears = tripStart.slice(0, 4) !== tripEnd.slice(0, 4);
  return spansYears && dateISO.slice(0, 4) !== tripStart.slice(0, 4) ? formatLongDate(dateISO) : formatDayLabel(dateISO);
}

export function dayEyebrow(i: { dayNumber: number; totalDays: number; chapterName: string | null; country: string | null; travelDay: boolean }): string {
  const head = `DAY ${i.dayNumber} OF ${i.totalDays}`;
  const tail = i.travelDay ? "TRAVEL DAY" : (i.chapterName ?? i.country);
  return tail ? `${head} · ${tail.toUpperCase()}` : head;
}

export interface SubLineInput { stopName: string | null; country: string | null; zone: string | null; nightOf: { night: number; of: number } | null; travel: { from: string; to: string; toZone: string | null } | null; compact: boolean }

export function daySubLine(i: SubLineInput): string {
  if (i.travel) {
    const zone = i.travel.toZone && i.zone && i.travel.toZone !== i.zone ? `${i.zone} → ${i.travel.toZone}` : (i.zone ?? i.travel.toZone);
    return [`${i.travel.from} → ${i.travel.to}`, zone].filter(Boolean).join(" · ");
  }
  if (!i.stopName) return "";
  const place = i.compact || !i.country ? i.stopName : `${i.stopName}, ${i.country}`;
  const night = i.nightOf ? `night ${i.nightOf.night} of ${i.nightOf.of}` : null;
  return [place, i.zone, night].filter(Boolean).join(" · ");
}

export function nightOfStay(dateISO: string, checkIn: string, checkOut: string): { night: number; of: number } | null {
  if (dateISO < checkIn || dateISO >= checkOut) return null;
  return { night: daysBetween(checkIn, dateISO) + 1, of: nightsBetween(checkIn, checkOut) };
}

/** Every calendar day of the Trip, start → end inclusive — the Day view strip shows them all (spec 2026-09-28 D1). */
export function tripDays(tripStart: string, tripEnd: string): string[] {
  const total = daysBetween(tripStart, tripEnd) + 1;
  return Array.from({ length: total }, (_, k) => addDays(tripStart, k));
}

export const dotsFor = (count: number) => Math.min(count, 3);

/**
 * The Day strip's stop line (spec 2026-09-29 D3): Home base → Stops → Home base.
 * Each day belongs to the Stop whose night it is; a Stop's depart day that is
 * nobody's night stays on that Stop (it is covered, not a Gap day). Any other
 * day is a Gap day, drawn as a dashed stretch labelled with the covering
 * Transport — the outbound leg before the first Stop, the return leg after the
 * last (lib/home-base.ts rule), else the leg between the neighbouring Stops.
 */
type StopLineSegment =
  | { kind: "stop"; name: string; startIndex: number; span: number; hueIndex: number }
  | { kind: "gap"; startIndex: number; span: number; mode: TransportMode | null; label: string | null };

export interface StopLine { homeStart: string | null; homeEnd: string | null; segments: StopLineSegment[] }
export interface LineStop { id: string; name: string; arriveDate: string; departDate: string; sortOrder: number }
export interface LineTransport {
  fromStopId: string | null;
  toStopId: string | null;
  depPlace: string | null;
  arrPlace: string | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  mode: TransportMode;
}

function coveringLeg(prev: LineStop | null, next: LineStop | null, transports: LineTransport[]): LineTransport | null {
  if (!prev && next) return findOutboundLeg(transports, next.id);
  if (prev && !next) return findReturnLeg(transports, prev.id);
  if (prev && next) {
    return (
      transports.find((t) => t.fromStopId === prev.id && t.toStopId === next.id) ??
      transports.find((t) => t.fromStopId === prev.id && !t.toStopId) ??
      transports.find((t) => !t.fromStopId && t.toStopId === next.id) ??
      null
    );
  }
  return null;
}

function legLabel(t: LineTransport, byId: Map<string, LineStop>, homeName: string | null): string | null {
  // Same endpoint precedence as the Transport card (components/trip/transport-card.tsx).
  const from = t.depIsHome ? homeName : ((t.fromStopId ? byId.get(t.fromStopId)?.name : null) ?? t.depPlace);
  const to = t.arrIsHome ? homeName : ((t.toStopId ? byId.get(t.toStopId)?.name : null) ?? t.arrPlace);
  if (from && to) return `${from} → ${to}`;
  return from ?? to ?? null;
}

export function stopLine(i: { days: string[]; stops: LineStop[]; transports: LineTransport[]; homeName: string | null; roundTrip: boolean }): StopLine {
  const sorted = [...i.stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const hue = new Map(sorted.map((s, k) => [s.id, k]));
  const byId = new Map(sorted.map((s) => [s.id, s]));
  const ownerOf = (d: string): LineStop | null => {
    const night = sorted
      .filter((s) => s.arriveDate <= d && d < s.departDate)
      .reduce<LineStop | null>((best, s) => (!best || s.arriveDate > best.arriveDate ? s : best), null);
    return night ?? sorted.find((s) => s.departDate === d) ?? null;
  };
  const owners = i.days.map(ownerOf);
  const segments: StopLineSegment[] = [];
  let k = 0;
  while (k < owners.length) {
    const o = owners[k];
    let end = k;
    while (end + 1 < owners.length && (owners[end + 1]?.id ?? null) === (o?.id ?? null)) end++;
    const span = end - k + 1;
    if (o) {
      segments.push({ kind: "stop", name: o.name, startIndex: k, span, hueIndex: hue.get(o.id) ?? 0 });
    } else {
      const prev = k > 0 ? owners[k - 1] : null;
      const next = end + 1 < owners.length ? owners[end + 1] : null;
      const leg = coveringLeg(prev, next, i.transports);
      segments.push({ kind: "gap", startIndex: k, span, mode: leg?.mode ?? null, label: leg ? legLabel(leg, byId, i.homeName) : null });
    }
    k = end + 1;
  }
  return { homeStart: i.homeName, homeEnd: i.homeName && i.roundTrip ? i.homeName : null, segments };
}

export const planCountLabel = (n: number) => (n === 0 ? "Nothing planned yet" : n === 1 ? "1 thing" : `${n} things`);

export interface IdeaRow { id: string; title: string; category: string; hint: string | null; pool: "todo" | "wishlist" }

function distanceHint(km: number): string { return km < 1 ? `≈${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`; }

export function dayIdeasRows(i: { stopName: string; thingsToDo: Array<{ id: string; title: string; category: string; startTime: string | null }>; wishlist: Array<{ id: string; title: string; category: string; distanceKm: number | null; reason: "nearby" | "country" | "unlocated" }>; limit?: number }): { rows: IdeaRow[]; all: IdeaRow[]; more: number; eyebrow: string | null } {
  const limit = i.limit ?? 3;
  const all: IdeaRow[] = [
    ...i.thingsToDo.map((t) => ({ id: t.id, title: t.title, category: t.category, hint: t.startTime ? `from ${t.startTime}` : null, pool: "todo" as const })),
    ...i.wishlist.map((w) => ({ id: w.id, title: w.title, category: w.category, hint: w.reason === "nearby" && w.distanceKm != null ? distanceHint(w.distanceKm) : w.reason === "country" ? "same country" : null, pool: "wishlist" as const })),
  ];
  const rows = all.slice(0, limit);
  if (rows.length === 0) return { rows, all, more: 0, eyebrow: null };
  const onlyWishlist = rows.every((r) => r.pool === "wishlist");
  const stop = i.stopName.toUpperCase();
  return { rows, all, more: all.length - rows.length, eyebrow: onlyWishlist ? `FROM YOUR WISHLIST IN ${stop}` : `IDEAS FOR ${stop}` };
}

export const forecastOpensOn = (dateISO: string) => formatDayLabel(addDays(dateISO, -15));

// ── One day, assembled (card 3.M) ─────────────────────────────────────────
// The Day view (lib/day-view-loader.ts) and the Travelling Home's today
// (lib/travelling-home-loader.ts) both build their day here from the same
// rows (lib/day-reads.ts), so Day and Today agree by construction. Pure and
// client-safe: the Surprise masking is done in the read, once per read, so
// every date of a window gets the same masked rows (CONTEXT.md "Surprise").

interface DayTripRow {
  name: string; startDate: string | null; endDate: string | null; homeCurrency: string;
  homeName: string | null; homeTimezone: string | null; chaptersEnabled: boolean; roundTrip: boolean;
}
interface DayStopRow {
  id: string; name: string; country: string | null; countryCode: string | null; timezone: string | null;
  arriveDate: string | null; departDate: string | null; sortOrder: number; lat: number | null; lng: number | null;
  surprise: SurpriseView | null;
}
interface DayItemRow {
  id: string; title: string; category: string; date: string | null; startTime: string | null; endTime: string | null;
  sortOrder: number; stopId: string | null; lat: number | null; lng: number | null; address: string | null;
  link: string | null; booking: string | null; notes: string | null; hiddenFromShares: boolean;
  photoAttachmentId: string | null; surprise: SurpriseView | null;
}
interface DayTransportRow {
  id: string; mode: string; fromStopId: string | null; toStopId: string | null; depPlace: string | null; arrPlace: string | null;
  depAt: Date | null; arrAt: Date | null; depLat: number | null; depLng: number | null; arrLat: number | null; arrLng: number | null;
  reference: string | null; notes: string | null; sortOrder: number; anchorStopId: string | null; depIsHome: boolean; arrIsHome: boolean;
}
interface DayAccommodationRow {
  id: string; stopId: string; name: string; address: string | null; checkIn: string; checkOut: string;
  checkInTime: string | null; checkOutTime: string | null; confirmation: string | null; notes: string | null;
  lat: number | null; lng: number | null;
}
interface DayWishlistRow { id: string; title: string; category: string; lat: number | null; lng: number | null; countryCode: string | null }
interface DayAttachmentRow {
  id: string; filename: string; title: string | null; mime: string; size: number; url: string;
  uploadedById: string; createdAt: Date; targetId: string | null;
}
interface DayChapterRow { id: string; name: string; colour: string; startDate: string | null; endDate: string | null; sortOrder: number }
interface DayTitleRow { stopId: string; dayIndex: number; title: string }
interface DayThingToDoRow { id: string; title: string; category: string; startTime: string | null; endTime: string | null; stopId: string | null }

export interface DayRows {
  trip: DayTripRow;
  /** `trip.startDate`. */
  startDate: string;
  /** `trip.endDate`, or the start when the Trip has none. */
  endDate: string;
  stops: DayStopRow[];
  items: DayItemRow[];
  transports: DayTransportRow[];
  accommodations: DayAccommodationRow[];
  wishlist: DayWishlistRow[];
  attachments: DayAttachmentRow[];
  chapters: DayChapterRow[];
  dayTitles: DayTitleRow[];
  thingsToDo: DayThingToDoRow[];
}

export interface DayModel {
  date: string;
  /** The whole Trip, built from every stay — the strip's dots and the next departure read it. */
  itinerary: DayPlan[];
  /** Null only for a date outside the Trip. */
  dayPlan: DayPlan | null;
  hasEntries: boolean;
  freeForm: boolean;
  /** The Stop row behind `dayPlan.stop` (the arriving one on a Changeover day); null on a gap day. */
  dayStop: DayStopRow | null;
  dayTitle: { title: string; stopId: string } | null;
  chapter: DayChapterRow | null;
  dayNumber: number;
  totalDays: number;
  /** The stays that touch the day (checkIn ≤ date ≤ checkOut). */
  accommodations: DayAccommodationRow[];
  /** Tonight's bed (checkIn ≤ date < checkOut). */
  tonight: DayAccommodationRow | null;
  attachmentsById: Map<string, { url: string }>;
  attachmentsByTarget: Record<string, DayAttachmentRow[]>;
  dayMap: DayMapModel;
  itemDirections: Record<string, { google: string | null; apple: string | null }>;
  /** Wishlist ideas near the day's located Items and tonight's bed. */
  nearby: NearbyResult[];
  /** The day's Stop's things to do — a free-form day with a Stop only (CONTEXT.md "Day ideas"). */
  thingsToDo: Array<{ id: string; title: string; category: string; startTime: string | null; endTime: string | null }>;
  /** Wishlist ideas for the day's Stop (near it, or in its country); [] on a gap day. */
  ideasWishlist: DayIdeaResult[];
}

interface TripDerived {
  itinerary: DayPlan[];
  attachmentsById: Map<string, { url: string }>;
  attachmentsByTarget: Record<string, DayAttachmentRow[]>;
  titles: Map<string, { title: string; stopId: string }>;
}
const derivedByRows = new WeakMap<DayRows, TripDerived>();

/** The Trip-wide projections every day of one read shares — built once per `rows`. */
function deriveTrip(rows: DayRows): TripDerived {
  const hit = derivedByRows.get(rows);
  if (hit) return hit;
  // CONTEXT.md "Item photo" — keyed by the Attachment's own id.
  const attachmentsById = new Map(rows.attachments.map((a) => [a.id, { url: a.url }]));
  const attachmentsByTarget: Record<string, DayAttachmentRow[]> = {};
  for (const a of rows.attachments) if (a.targetId) (attachmentsByTarget[a.targetId] ??= []).push(a);
  const derived: TripDerived = {
    attachmentsById,
    attachmentsByTarget,
    titles: titlesByDate(
      rows.stops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })),
      rows.dayTitles,
    ),
    itinerary: buildItinerary({
      startDate: rows.startDate,
      endDate: rows.endDate,
      // Non-null at runtime: the read keeps dated Stops only.
      stops: rows.stops.map((s) => ({
        id: s.id, name: s.name, country: s.country, timezone: s.timezone ?? "UTC",
        arriveDate: s.arriveDate!, departDate: s.departDate!, sortOrder: s.sortOrder,
      })),
      items: rows.items.map((i) => ({
        id: i.id, title: i.title, category: i.category, date: i.date, startTime: i.startTime, endTime: i.endTime,
        stopId: i.stopId, address: i.address, link: i.link, booking: i.booking, notes: i.notes,
        hiddenFromShares: i.hiddenFromShares, photoUrl: itemPhotoUrl(i, attachmentsById), surprise: i.surprise,
      })),
      transports: rows.transports.map((t) => ({
        id: t.id, mode: t.mode as TransportMode, fromStopId: t.fromStopId, toStopId: t.toStopId,
        depPlace: t.depPlace, arrPlace: t.arrPlace, depAt: t.depAt, arrAt: t.arrAt,
        reference: t.reference, notes: t.notes, depIsHome: t.depIsHome, arrIsHome: t.arrIsHome,
      })),
      // Every stay (TB-10): a day's check-in/out entries never depend on which day was asked for.
      accommodations: rows.accommodations.map((a) => ({
        id: a.id, stopId: a.stopId, name: a.name, address: a.address, checkIn: a.checkIn, checkOut: a.checkOut,
        checkInTime: a.checkInTime, checkOutTime: a.checkOutTime, confirmation: a.confirmation, notes: a.notes,
      })),
      homeTimezone: rows.trip.homeTimezone,
    }),
  };
  derivedByRows.set(rows, derived);
  return derived;
}

/** One dated day, from the rows `lib/day-reads.ts` read — the Day view's and Today's shared core. */
export function buildDayModel(rows: DayRows, date: string): DayModel {
  const trip = deriveTrip(rows);
  const dayPlan = pickDayPlan(trip.itinerary, date);
  const dayStop = rows.stops.find((s) => s.id === dayPlan?.stop?.id) ?? null;
  const freeForm = dayPlan ? isFreeFormDay(dayPlan) : false;

  const accommodations = rows.accommodations.filter((a) => a.checkIn <= date && a.checkOut >= date);
  const tonight = accommodations.find((a) => a.checkOut > date) ?? null;
  const bed = tonight ? { id: tonight.id, name: tonight.name, lat: tonight.lat, lng: tonight.lng, address: tonight.address } : null;

  const dayItems = rows.items
    .filter((i) => i.date === date)
    .map((i) => ({ id: i.id, title: i.title, lat: i.lat, lng: i.lng, address: i.address, startTime: i.startTime, sortOrder: i.sortOrder }));
  const legIds = new Set((dayPlan?.transportEntries ?? []).map((e) => e.transport.id));
  const dayMap = buildDayMapModel({
    date,
    items: dayItems,
    accommodation: bed,
    transports: rows.transports
      .filter((t) => legIds.has(t.id))
      .map((t) => ({ id: t.id, depPlace: t.depPlace, arrPlace: t.arrPlace, depLat: t.depLat, depLng: t.depLng, arrLat: t.arrLat, arrLng: t.arrLng })),
  });

  // Nearby Wishlist rail: the day's located Items + tonight's bed.
  const anchors = [
    ...dayItems.filter((i) => i.lat != null && i.lng != null).map((i) => ({ lat: i.lat!, lng: i.lng! })),
    ...(bed?.lat != null && bed?.lng != null ? [{ lat: bed.lat, lng: bed.lng }] : []),
  ];
  const nearby = nearbyWishlistItems({
    anchors,
    candidates: rows.wishlist
      .filter((w) => w.lat != null && w.lng != null)
      .map((w) => ({ id: w.id, title: w.title, category: w.category, lat: w.lat!, lng: w.lng! })),
  });

  return {
    date,
    itinerary: trip.itinerary,
    dayPlan,
    hasEntries: dayPlan != null && dayHasEntries(dayPlan),
    freeForm,
    dayStop,
    dayTitle: trip.titles.get(date) ?? null,
    chapter: chapterForDate(date, rows.chapters),
    dayNumber: dayNumberInTrip(date, rows.startDate),
    totalDays: dayNumberInTrip(rows.endDate, rows.startDate),
    accommodations,
    tonight,
    attachmentsById: trip.attachmentsById,
    attachmentsByTarget: trip.attachmentsByTarget,
    dayMap,
    itemDirections: buildItemDirections(dayMap),
    nearby,
    thingsToDo:
      freeForm && dayStop
        ? rows.thingsToDo
            .filter((t) => t.stopId === dayStop.id)
            .map(({ id, title, category, startTime, endTime }) => ({ id, title, category, startTime, endTime }))
        : [],
    ideasWishlist: dayStop
      ? dayIdeasWishlist({ stop: { lat: dayStop.lat, lng: dayStop.lng, countryCode: dayStop.countryCode }, candidates: rows.wishlist })
      : [],
  };
}
