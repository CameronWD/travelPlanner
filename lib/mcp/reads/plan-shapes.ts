/**
 * The Claude connection's per-entity plan shapes (spec 2026-10-16 F7): the
 * one definition of how a Stop, its Accommodation, a thing to do, a
 * Transport leg, a Chapter and the Trip itself read. get_trip_plan
 * (./trip-plan.ts) and the narrow reads (./entities.ts, ./day.ts) build from
 * these, so a narrow read is that entity's slice of get_trip_plan by
 * construction. Pure: no db, no guards.
 */
import { buildStopDays, groupScheduledItemsByStop, type StopDayItem } from "@/lib/stop-days";
import { transportTimeDisplay } from "@/lib/time-display";
import type { BookingState } from "@/lib/enum-values";
import type { OpeningHours } from "@/lib/opening-hours";
import { withOpeningHours } from "@/lib/opening-hours-stored";
import { parseOpeningHours } from "@/lib/validations/opening-hours";
import type { SurpriseView } from "@/lib/surprise";
import type { SurpriseVisibility } from "@/lib/surprise-visibility";
import type { McpFileRef } from "./attachments";

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * CONTEXT.md "Slot time": Section S stores refundable as a plain
 * true/false/not-known column, not an enum, but Claude's reads (here) and
 * writes (lib/mcp/tools/plan-write.ts) speak the same tri-state vocabulary.
 */
type McpRefundable = "YES" | "NO" | "UNKNOWN";

/**
 * A live Surprise as Claude sees it. `youAreSurprised` true means the acting
 * Traveller may not see inside; false means they are the planner or a helper,
 * and `for` names who must not see it.
 */
export interface McpSurprise {
  plannedBy: string;
  for: string[];
  youAreSurprised: boolean;
}

export interface McpAccommodation {
  id: string;
  name: string;
  address: string | null;
  checkIn: string;
  checkOut: string;
  confirmation: string | null;
  notes: string | null;
  /** CONTEXT.md "Booking state": NONE (no booking needed), TO_BOOK or BOOKED. Booked is not paid (that's the Cost). */
  bookingState: BookingState;
  /** YYYY-MM-DD it should be booked by; only while TO_BOOK. */
  bookBy: string | null;
  files: McpFileRef[];
}

interface McpThingToDo {
  id: string;
  title: string;
  category: string;
  address: string | null;
  link: string | null;
  booking: string | null;
  notes: string | null;
  /** CONTEXT.md "Booking state": NONE (no booking needed), TO_BOOK or BOOKED. Booked is not paid (that's the Cost). */
  bookingState: BookingState;
  /** YYYY-MM-DD it should be booked by; only while TO_BOOK. */
  bookBy: string | null;
  /** CONTEXT.md "Slot time": the ticket's time (HH:MM, the Stop's local time), or null. The start time is the plan; it defaults to slot less arriveByMinutes. */
  slotTime: string | null;
  /** How many minutes before the slot to be there, or null. */
  arriveByMinutes: number | null;
  /** YES, NO or UNKNOWN (not known). */
  refundable: McpRefundable;
  /** CONTEXT.md "Opening hours": week (sun..sat), seasons and closed dates, in the Stop's local time; null = not known. */
  openingHours: OpeningHours | null;
  files: McpFileRef[];
  surprise: McpSurprise | null;
}

export interface McpDayItem {
  id: string;
  title: string;
  category: string;
  startTime: string | null;
  endTime: string | null;
  address: string | null;
  link: string | null;
  booking: string | null;
  notes: string | null;
  /** CONTEXT.md "Booking state": NONE (no booking needed), TO_BOOK or BOOKED. Booked is not paid (that's the Cost). */
  bookingState: BookingState;
  /** YYYY-MM-DD it should be booked by; only while TO_BOOK. */
  bookBy: string | null;
  /** CONTEXT.md "Slot time": the ticket's time (HH:MM, the Stop's local time), or null. The start time is the plan; it defaults to slot less arriveByMinutes. */
  slotTime: string | null;
  /** How many minutes before the slot to be there, or null. */
  arriveByMinutes: number | null;
  /** YES, NO or UNKNOWN (not known). */
  refundable: McpRefundable;
  /** CONTEXT.md "Opening hours": week (sun..sat), seasons and closed dates, in the Stop's local time; null = not known. */
  openingHours: OpeningHours | null;
  /**
   * The Stop this thing is owned by: the one whose Budget line its Cost
   * counts against. On a Changeover day the thing is listed under both
   * Stops' days (and get_day's stop is the arriving one), but it has this
   * one owner. Null for a dated thing with no Stop.
   */
  owningStop: McpOwningStop | null;
  files: McpFileRef[];
  surprise: McpSurprise | null;
}

/** CONTEXT.md "Changeover day" (ADR 0049): the one Stop a scheduled thing is counted against. */
export interface McpOwningStop {
  id: string;
  name: string;
}

interface McpStopDay {
  /** YYYY-MM-DD */
  date: string;
  dayTitle: string | null;
  items: McpDayItem[];
}

export interface McpStop {
  id: string;
  name: string;
  countryCode: string | null;
  /** True while the Stop has no dates yet. */
  rough: boolean;
  nights: number | null;
  arriveDate: string | null;
  departDate: string | null;
  pinned: boolean;
  chapterId: string | null;
  notes: string | null;
  /** IANA zone, or null while the Stop is rough (no timezone set yet). */
  timezone: string | null;
  accommodations: McpAccommodation[];
  thingsToDo: McpThingToDo[];
  days: McpStopDay[];
  files: McpFileRef[];
  surprise: McpSurprise | null;
}

type McpTransportEndpoint = { home: true } | { stopId: string; name: string } | null;

/** One end of a Transport leg, in that end's own zone (the app's rule — see `resolveEndpointZones`). */
interface McpLocalTime {
  /** ISO instant, same value as the matching `depAt`/`arrAt`. */
  at: string;
  /** HH:MM, 24-hour, in `zone`. */
  localTime: string;
  /** YYYY-MM-DD, in `zone`. */
  localDate: string;
  /** Short zone label, e.g. "CEST"; "UTC" when the zone is unknown. */
  zone: string;
}

export interface McpTransport {
  id: string;
  mode: string;
  from: McpTransportEndpoint;
  to: McpTransportEndpoint;
  depPlace: string | null;
  arrPlace: string | null;
  /** ISO datetime, or null while not yet timed. */
  depAt: string | null;
  arrAt: string | null;
  /** `depAt` rendered in its own end's zone; null while untimed. */
  departs: McpLocalTime | null;
  /** `arrAt` rendered in its own end's zone; null while untimed. */
  arrives: McpLocalTime | null;
  /** arr calendar date minus dep calendar date, each in its own zone; 0 same day. */
  dayDelta: number;
  reference: string | null;
  notes: string | null;
  /** CONTEXT.md "Booking state": NONE (no booking needed), TO_BOOK or BOOKED. Booked is not paid (that's the Cost). */
  bookingState: BookingState;
  /** YYYY-MM-DD it should be booked by; only while TO_BOOK. */
  bookBy: string | null;
  files: McpFileRef[];
}

export interface McpChapter {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}

/** One thing to do with its date and owning Stop: a get_trip_plan `unplacedDatedItems` entry, with `date` null when undated (get_item). */
export interface McpItem extends McpDayItem {
  /** YYYY-MM-DD, or null for a thing to do with no date (or a Wishlist idea). */
  date: string | null;
  stopId: string | null;
}

/**
 * A dated thing to do that no scheduled Stop's stay covers, so it sits on
 * no Stop's `days`: typically one added with a date but no Stop, on a day
 * outside every Stop's dates. `stopId` is its owning Stop, if any.
 */
export interface McpUnplacedDatedItem extends McpItem {
  /** YYYY-MM-DD */
  date: string;
}

/** get_trip_plan's `trip`; also every Trip write's read-back (F6). */
export interface McpTripSummary {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  hardEndDate: string | null;
  homeCurrency: string;
  homeBase: string | null;
  homeTimezone: string | null;
  roundTrip: boolean;
  files: McpFileRef[];
}

// ── Selects ──────────────────────────────────────────────────────────────

export const MCP_ACCOMMODATION_SELECT = {
  id: true, name: true, address: true, checkIn: true, checkOut: true, confirmation: true, notes: true,
  bookingState: true, bookBy: true,
} as const;

const MCP_STOP_FIELDS = {
  id: true, name: true, countryCode: true, timezone: true, arriveDate: true, departDate: true,
  nights: true, pinned: true, chapterId: true, notes: true, sortOrder: true,
} as const;

/** A Stop with its Accommodation; `accommodationWhere` is the Surprise fragment (`v.where.accommodation`). */
export const mcpStopSelect = (accommodationWhere: object) => ({
  ...MCP_STOP_FIELDS,
  accommodations: { where: accommodationWhere, orderBy: { checkIn: "asc" as const }, select: MCP_ACCOMMODATION_SELECT },
});

export const MCP_THING_TO_DO_SELECT = {
  id: true, title: true, category: true, startTime: true, endTime: true,
  address: true, link: true, booking: true, notes: true, stopId: true,
  bookingState: true, bookBy: true, slotTime: true, arriveByMinutes: true, refundable: true,
  openingHours: true,
} as const;

export const MCP_DATED_ITEM_SELECT = { ...MCP_THING_TO_DO_SELECT, date: true } as const;

export const MCP_TRANSPORT_SELECT = {
  id: true, mode: true, fromStopId: true, toStopId: true, depIsHome: true, arrIsHome: true,
  depPlace: true, arrPlace: true, depAt: true, arrAt: true, reference: true, notes: true,
  bookingState: true, bookBy: true,
} as const;

export const MCP_CHAPTER_SELECT = { id: true, name: true, startDate: true, endDate: true } as const;

export const MCP_TRIP_SELECT = {
  name: true, startDate: true, endDate: true, hardEndDate: true, homeCurrency: true,
  homeName: true, homeTimezone: true, roundTrip: true,
} as const;

// ── Row types (what the selects above return) ────────────────────────────

/*
 * `bookingState` is a plain String column holding one of BOOKING_STATES
 * (every writer stores lib/booking-state.ts `bookingStateWrite`'s result), so
 * the rows take the string and the shapes below name it as the union, as
 * lib/plan-reads.ts does.
 */
type AccommodationRow = Omit<McpAccommodation, "files" | "bookingState"> & { bookingState: string };

export interface McpStopRow {
  id: string; name: string; countryCode: string | null; timezone: string | null;
  arriveDate: string | null; departDate: string | null; nights: number | null; pinned: boolean;
  chapterId: string | null; notes: string | null; sortOrder: number;
  accommodations: AccommodationRow[];
  /** maskSurpriseStops' view, null for a Stop that is no Surprise. */
  surprise: SurpriseView | null;
}

export interface McpItemRow {
  id: string; title: string; category: string; date: string | null; startTime: string | null; endTime: string | null;
  address: string | null; link: string | null; booking: string | null; notes: string | null; stopId: string | null;
  bookingState: string; bookBy: string | null;
  slotTime?: string | null; arriveByMinutes?: number | null; refundable?: boolean | null;
  /** The stored column: a JSON string, or null. Parse at the row edge with `withOpeningHours`/`parseOpeningHours` before building a shape — never hand this straight to a shape that expects `OpeningHours`. */
  openingHours: string | null;
}

export interface McpTransportRow {
  id: string; mode: string; fromStopId: string | null; toStopId: string | null; depIsHome: boolean; arrIsHome: boolean;
  depPlace: string | null; arrPlace: string | null; depAt: Date | null; arrAt: Date | null; reference: string | null; notes: string | null;
  bookingState: string; bookBy: string | null;
}

export type FilesFor = (kind: "STOP" | "ACCOMMODATION" | "TRANSPORT" | "ITEM", id: string) => McpFileRef[];

// ── Shapes ───────────────────────────────────────────────────────────────

export function toMcpSurprise(view: SurpriseView | null | undefined): McpSurprise | null {
  return view ? { plannedBy: view.plannerName, for: view.forNames, youAreSurprised: view.youAreSurprised } : null;
}

/**
 * The Stop a day item is owned by (R5): null for no Stop. Fix round 1
 * (controller ruling): every caller passes a `names` map covering every
 * real-plan Stop of the trip, rough ones included (get_day's own fix), so a
 * known stopId should always resolve; if a name is somehow still missing,
 * this returns null rather than inventing prose.
 */
export function owningStopRef(stopId: string | null | undefined, names: ReadonlyMap<string, string>): McpOwningStop | null {
  if (!stopId) return null;
  const name = names.get(stopId);
  return name ? { id: stopId, name } : null;
}

/** The Slot time fields as Claude reads them; a row without them reads as none / UNKNOWN. */
function mcpSlot(i: {
  slotTime?: string | null;
  arriveByMinutes?: number | null;
  refundable?: boolean | null;
}): { slotTime: string | null; arriveByMinutes: number | null; refundable: McpRefundable } {
  return {
    slotTime: i.slotTime ?? null,
    arriveByMinutes: i.arriveByMinutes ?? null,
    refundable: i.refundable === true ? "YES" : i.refundable === false ? "NO" : "UNKNOWN",
  };
}

export function toMcpAccommodation(a: AccommodationRow, filesFor: FilesFor): McpAccommodation {
  return { ...a, bookingState: a.bookingState as BookingState, files: filesFor("ACCOMMODATION", a.id) };
}

function toMcpThingToDo(i: Omit<McpItemRow, "date">, filesFor: FilesFor, view: SurpriseView | null | undefined): McpThingToDo {
  return {
    id: i.id, title: i.title, category: i.category, address: i.address, link: i.link, booking: i.booking,
    notes: i.notes, bookingState: i.bookingState as BookingState, bookBy: i.bookBy, ...mcpSlot(i),
    openingHours: parseOpeningHours(i.openingHours),
    files: filesFor("ITEM", i.id), surprise: toMcpSurprise(view),
  };
}

/** A dated thing to do on a day (get_trip_plan's `days[].items`, get_day's timeline). Its `openingHours` has already been parsed at the row edge (`StopDayItem.openingHours` is the model, never the stored string). */
export function toMcpDayItem(i: Omit<StopDayItem, "bookingStateSet">, filesFor: FilesFor, stopNameById: ReadonlyMap<string, string>): McpDayItem {
  return {
    id: i.id, title: i.title, category: i.category,
    startTime: i.startTime ?? null, endTime: i.endTime ?? null, address: i.address ?? null,
    link: i.link ?? null, booking: i.booking ?? null, notes: i.notes ?? null,
    bookingState: i.bookingState ?? "NONE", bookBy: i.bookBy ?? null, ...mcpSlot(i),
    openingHours: i.openingHours ?? null,
    owningStop: owningStopRef(i.stopId, stopNameById),
    files: filesFor("ITEM", i.id), surprise: toMcpSurprise(i.surprise),
  };
}

/**
 * Fix round 1 (controller ruling): a `McpItemRow` with its `openingHours`
 * parsed once at the MCP row edge (`withOpeningHours`) and its Surprise view
 * attached. Parsing here — rather than inside `toMcpDayItem`/`toMcpItem` on
 * every read — means the `datedItems as unknown as StopDayItem[]` cast
 * `buildMcpStops` makes to group these rows is honest: `openingHours` really
 * is an `OpeningHours | null` by the time anything (Branch 2's Flags
 * included) sees it as a `StopDayItem`, never a raw JSON string wearing that
 * type.
 */
type DatedItem = Omit<McpItemRow, "openingHours"> & { openingHours: OpeningHours | null; surprise: SurpriseView | null };

export function toMcpItem(i: DatedItem, filesFor: FilesFor, stopNameById: ReadonlyMap<string, string>): McpItem {
  return {
    ...toMcpDayItem({ ...i, bookingState: i.bookingState as BookingState }, filesFor, stopNameById),
    date: i.date,
    stopId: i.stopId,
  };
}

/**
 * The real plan's dated Items with each hidden Surprise Item joined as a
 * placeholder titled "Surprise" on its date and time (ADR 0051), date order,
 * same-day order kept. Each scheduled row's `openingHours` is parsed once
 * here (`withOpeningHours`), at the row edge — see `DatedItem`.
 */
export function withPlaceholders(
  scheduled: McpItemRow[],
  v: Pick<SurpriseVisibility, "placeholderItems" | "views">,
): DatedItem[] {
  return [
    ...scheduled.map((i) => ({ ...withOpeningHours(i), surprise: v.views.items.get(i.id) ?? null })),
    ...v.placeholderItems
      .filter((p) => p.forkId === null && p.date !== null)
      .map((p) => ({
        id: p.id, title: p.title, category: p.category, date: p.date, startTime: p.startTime, endTime: p.endTime,
        address: p.address, link: p.link, booking: p.booking, notes: p.notes, stopId: p.stopId,
        bookingState: p.bookingState, bookBy: p.bookBy,
        slotTime: p.slotTime, arriveByMinutes: p.arriveByMinutes, refundable: p.refundable,
        openingHours: p.openingHours,
        surprise: p.surprise,
      })),
  ].sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));
}

/**
 * Stops as get_trip_plan reads them. `stops` arrive ordered and masked
 * (`maskSurpriseStops`). Day rows are grouped by DATE COVERAGE (ADR 0049),
 * so a Changeover day's Item sits under both Stops. A hidden Stop keeps its
 * shell: no days, and its dates neither title a day nor gather Items.
 * `coveredItemIds` names every dated Item that landed on some Stop's day.
 */
export function buildMcpStops(input: {
  stops: McpStopRow[];
  /** Undated things to do (MCP_THING_TO_DO_SELECT): no `date`. */
  thingsToDo: Omit<McpItemRow, "date">[];
  datedItems: DatedItem[];
  dayTitles: Map<string, { title: string; stopId: string }>;
  hiddenStopIds: ReadonlySet<string>;
  itemView: (id: string) => SurpriseView | null;
  filesFor: FilesFor;
  /** Every real-plan Stop's name, for `owningStop` (R5); a hidden Surprise Stop keeps its name (its shell). */
  stopNameById: ReadonlyMap<string, string>;
}): { stops: McpStop[]; coveredItemIds: Set<string> } {
  const { stops, thingsToDo, datedItems, dayTitles, hiddenStopIds, itemView, filesFor, stopNameById } = input;
  const openStops = stops.filter((s) => !hiddenStopIds.has(s.id));

  const thingsToDoByStopId = new Map<string, McpThingToDo[]>();
  for (const i of thingsToDo) {
    if (!i.stopId) continue;
    const list = thingsToDoByStopId.get(i.stopId) ?? [];
    list.push(toMcpThingToDo(i, filesFor, itemView(i.id)));
    thingsToDoByStopId.set(i.stopId, list);
  }

  const dayItemsByStopId = groupScheduledItemsByStop(openStops, datedItems as unknown as StopDayItem[]);

  const mcpStops = stops.map((stop): McpStop => {
    const rough = !(stop.arriveDate && stop.departDate);
    const days: McpStopDay[] = rough || hiddenStopIds.has(stop.id)
      ? []
      : buildStopDays(stop.arriveDate!, stop.departDate!, dayItemsByStopId.get(stop.id) ?? []).map((day) => ({
          date: day.dateISO,
          dayTitle: dayTitles.get(day.dateISO)?.title ?? null,
          items: [...day.timed, ...day.untimed].map((i) => toMcpDayItem(i, filesFor, stopNameById)),
        }));
    return {
      id: stop.id, name: stop.name, countryCode: stop.countryCode, rough, nights: stop.nights,
      arriveDate: stop.arriveDate, departDate: stop.departDate, pinned: stop.pinned, chapterId: stop.chapterId,
      notes: stop.notes, timezone: stop.timezone,
      accommodations: stop.accommodations.map((a) => toMcpAccommodation(a, filesFor)),
      thingsToDo: thingsToDoByStopId.get(stop.id) ?? [],
      days,
      files: filesFor("STOP", stop.id),
      surprise: toMcpSurprise(stop.surprise),
    };
  });

  return { stops: mcpStops, coveredItemIds: new Set([...dayItemsByStopId.values()].flat().map((i) => i.id)) };
}

/** One Transport leg, each end in its own zone (`transportTimeDisplay`, the Plan editor's rule). */
export function toMcpTransport(
  t: McpTransportRow,
  ctx: { stopNameById: ReadonlyMap<string, string>; tzById: ReadonlyMap<string, string | null>; homeTimezone: string | null; filesFor: FilesFor },
): McpTransport {
  const endpoint = (stopId: string | null, isHome: boolean): McpTransportEndpoint => {
    if (isHome) return { home: true };
    if (stopId) return { stopId, name: ctx.stopNameById.get(stopId) ?? stopId };
    return null;
  };
  const local = (at: Date | null, part: { time: string; zone: string; dateISO: string } | null): McpLocalTime | null =>
    at && part ? { at: at.toISOString(), localTime: part.time, localDate: part.dateISO, zone: part.zone } : null;
  const shown = transportTimeDisplay({
    depAt: t.depAt, arrAt: t.arrAt,
    fromTimezone: t.fromStopId ? ctx.tzById.get(t.fromStopId) ?? null : null,
    toTimezone: t.toStopId ? ctx.tzById.get(t.toStopId) ?? null : null,
    depIsHome: t.depIsHome, arrIsHome: t.arrIsHome, homeTimezone: ctx.homeTimezone,
  });
  return {
    id: t.id, mode: t.mode,
    from: endpoint(t.fromStopId, t.depIsHome), to: endpoint(t.toStopId, t.arrIsHome),
    depPlace: t.depPlace, arrPlace: t.arrPlace,
    depAt: t.depAt ? t.depAt.toISOString() : null, arrAt: t.arrAt ? t.arrAt.toISOString() : null,
    departs: local(t.depAt, shown.dep), arrives: local(t.arrAt, shown.arr), dayDelta: shown.dayDelta,
    reference: t.reference, notes: t.notes,
    bookingState: t.bookingState as BookingState, bookBy: t.bookBy,
    files: ctx.filesFor("TRANSPORT", t.id),
  };
}

type TripRow = {
  name: string; startDate: string | null; endDate: string | null; hardEndDate: string | null; homeCurrency: string;
  homeName: string | null; homeTimezone: string | null; roundTrip: boolean;
};

export function toMcpTrip(tripId: string, trip: TripRow | null, files: McpFileRef[]): McpTripSummary {
  return {
    id: tripId,
    name: trip?.name ?? "",
    startDate: trip?.startDate ?? null,
    endDate: trip?.endDate ?? null,
    hardEndDate: trip?.hardEndDate ?? null,
    homeCurrency: trip?.homeCurrency ?? "AUD",
    homeBase: trip?.homeName ?? null,
    homeTimezone: trip?.homeTimezone ?? null,
    roundTrip: trip?.roundTrip ?? false,
    files,
  };
}
