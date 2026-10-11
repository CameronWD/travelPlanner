/**
 * `get_trip_plan`'s loader (spec 2026-10-09, Task 9). Mirrors the Plan
 * editor's queries (`app/(app)/trips/[tripId]/plan/page.tsx`), trimmed to
 * what a Claude connection needs to read and reason about the Plan — no
 * Costs, no Attachments, no edit-time bookkeeping. Transport endpoints carry
 * each end's local time and zone (spec 2026-10-11 Task 1), computed the same
 * way the Plan editor shows them (`transportTimeDisplay`), and the file lists
 * the trip's Travellers. Real plan only: every query is scoped with
 * `REAL_PLAN`, never `resolvePlan`, and this never accepts a `forkId`.
 */
import { requireTripAccess } from "@/lib/guards";
import { db } from "@/lib/db";
import { REAL_PLAN, THINGS_TO_DO_WHERE } from "@/lib/plan-scope";
import { orderPlanStops } from "@/lib/plan-order";
import { buildStopDays, groupScheduledItemsByStop, type StopDayItem } from "@/lib/stop-days";
import { loadDayTitles } from "@/lib/day-titles-loader";
import { transportTimeDisplay } from "@/lib/time-display";
import { travellerName, TRAVELLER_SELECT } from "@/lib/traveller";

export interface McpAccommodation {
  id: string;
  name: string;
  address: string | null;
  checkIn: string;
  checkOut: string;
  confirmation: string | null;
  notes: string | null;
}

export interface McpThingToDo {
  id: string;
  title: string;
  category: string;
  address: string | null;
  link: string | null;
  booking: string | null;
  notes: string | null;
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
}

export interface McpStopDay {
  /** YYYY-MM-DD */
  date: string;
  dayTitle: string | null;
  items: McpDayItem[];
}

/**
 * A dated thing to do that no scheduled Stop's stay covers, so it sits on
 * no Stop's `days`: typically one added with a date but no Stop, on a day
 * outside every Stop's dates. `stopId` is its owning Stop, if any.
 */
export interface McpUnplacedDatedItem extends McpDayItem {
  /** YYYY-MM-DD */
  date: string;
  stopId: string | null;
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
}

export type McpTransportEndpoint = { home: true } | { stopId: string; name: string } | null;

/** One end of a Transport leg, in that end's own zone (the app's rule — see `resolveEndpointZones`). */
export interface McpLocalTime {
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
}

export interface McpChapter {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}

/** A Trip's Traveller, named and never carrying an email. */
export interface McpTraveller {
  name: string;
  role: "owner" | "traveller";
  /** True for the Traveller making this Claude connection's request. */
  you: boolean;
}

export interface McpTripPlan {
  trip: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    hardEndDate: string | null;
    homeCurrency: string;
    homeBase: string | null;
    roundTrip: boolean;
  };
  stops: McpStop[];
  transports: McpTransport[];
  chapters: McpChapter[];
  /** Dated things to do that fall on no Stop's days, soonest first. */
  unplacedDatedItems: McpUnplacedDatedItem[];
  travellers: McpTraveller[];
}

function toItemView(item: {
  id: string;
  title: string;
  category: string;
  startTime: string | null;
  endTime: string | null;
  address: string | null;
  link: string | null;
  booking: string | null;
  notes: string | null;
}): McpDayItem {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    startTime: item.startTime,
    endTime: item.endTime,
    address: item.address,
    link: item.link,
    booking: item.booking,
    notes: item.notes,
  };
}

export async function loadTripPlanForMcp(tripId: string): Promise<McpTripPlan> {
  const { user } = await requireTripAccess(tripId);

  const [trip, stopsRaw, transportsRaw, chaptersRaw, thingsToDoItems, scheduledItems, members] = await Promise.all([
    db.trip.findUnique({
      where: { id: tripId },
      select: {
        name: true,
        startDate: true,
        endDate: true,
        hardEndDate: true,
        homeCurrency: true,
        homeName: true,
        roundTrip: true,
      },
    }),
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        countryCode: true,
        timezone: true,
        arriveDate: true,
        departDate: true,
        nights: true,
        pinned: true,
        chapterId: true,
        notes: true,
        sortOrder: true,
        accommodations: {
          orderBy: { checkIn: "asc" },
          select: { id: true, name: true, address: true, checkIn: true, checkOut: true, confirmation: true, notes: true },
        },
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
        depIsHome: true,
        arrIsHome: true,
        depPlace: true,
        arrPlace: true,
        depAt: true,
        arrAt: true,
        reference: true,
        notes: true,
      },
    }),
    db.chapter.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, startDate: true, endDate: true },
    }),
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, ...THINGS_TO_DO_WHERE },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        title: true,
        category: true,
        startTime: true,
        endTime: true,
        address: true,
        link: true,
        booking: true,
        notes: true,
        stopId: true,
      },
    }),
    db.item.findMany({
      // No stopId filter: a dated Item with no Stop is still on the plan,
      // and lands on whichever Stop's days cover its date (ADR 0049).
      where: { tripId, ...REAL_PLAN, date: { not: null } },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        title: true,
        category: true,
        date: true,
        startTime: true,
        endTime: true,
        address: true,
        link: true,
        booking: true,
        notes: true,
        stopId: true,
      },
    }),
    db.tripMember.findMany({
      where: { tripId },
      orderBy: { createdAt: "asc" },
      select: { role: true, user: { select: TRAVELLER_SELECT } },
    }),
  ]);

  const stops = orderPlanStops(stopsRaw);
  const stopNameById = new Map(stops.map((s) => [s.id, s.name]));

  const thingsToDoByStopId = new Map<string, McpThingToDo[]>();
  for (const item of thingsToDoItems) {
    if (!item.stopId) continue;
    const existing = thingsToDoByStopId.get(item.stopId) ?? [];
    existing.push({
      id: item.id,
      title: item.title,
      category: item.category,
      address: item.address,
      link: item.link,
      booking: item.booking,
      notes: item.notes,
    });
    thingsToDoByStopId.set(item.stopId, existing);
  }

  // Day rows are grouped by DATE COVERAGE, not by stopId (ADR 0049): a
  // Changeover day shows the same Item under both adjoining Stops.
  const dayItemsByStopId = groupScheduledItemsByStop(
    stops,
    scheduledItems as unknown as StopDayItem[],
  );
  const dayTitles = await loadDayTitles(stops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })));

  const mcpStops: McpStop[] = stops.map((stop) => {
    const rough = !(stop.arriveDate && stop.departDate);
    const days: McpStopDay[] = rough
      ? []
      : buildStopDays(stop.arriveDate!, stop.departDate!, dayItemsByStopId.get(stop.id) ?? []).map((day) => ({
          date: day.dateISO,
          dayTitle: dayTitles.get(day.dateISO)?.title ?? null,
          items: [...day.timed, ...day.untimed].map((i) =>
            toItemView({
              id: i.id,
              title: i.title,
              category: i.category,
              startTime: i.startTime ?? null,
              endTime: i.endTime ?? null,
              address: i.address ?? null,
              link: i.link ?? null,
              booking: i.booking ?? null,
              notes: i.notes ?? null,
            }),
          ),
        }));

    return {
      id: stop.id,
      name: stop.name,
      countryCode: stop.countryCode,
      rough,
      nights: stop.nights,
      arriveDate: stop.arriveDate,
      departDate: stop.departDate,
      pinned: stop.pinned,
      chapterId: stop.chapterId,
      notes: stop.notes,
      timezone: stop.timezone,
      accommodations: stop.accommodations,
      thingsToDo: thingsToDoByStopId.get(stop.id) ?? [],
      days,
    };
  });

  const coveredIds = new Set([...dayItemsByStopId.values()].flat().map((i) => i.id));
  const unplacedDatedItems: McpUnplacedDatedItem[] = scheduledItems
    .filter((i) => !coveredIds.has(i.id))
    .map((i) => ({ ...toItemView(i), date: i.date as string, stopId: i.stopId }));

  const endpoint = (stopId: string | null, isHome: boolean): McpTransportEndpoint => {
    if (isHome) return { home: true };
    if (stopId) return { stopId, name: stopNameById.get(stopId) ?? stopId };
    return null;
  };

  const tzById = new Map(stops.map((s) => [s.id, s.timezone]));

  const local = (
    at: Date | null,
    part: { time: string; zone: string; dateISO: string } | null,
  ): McpLocalTime | null =>
    at && part ? { at: at.toISOString(), localTime: part.time, localDate: part.dateISO, zone: part.zone } : null;

  const transports: McpTransport[] = transportsRaw.map((t) => {
    const shown = transportTimeDisplay({
      depAt: t.depAt,
      arrAt: t.arrAt,
      fromTimezone: t.fromStopId ? tzById.get(t.fromStopId) ?? null : null,
      toTimezone: t.toStopId ? tzById.get(t.toStopId) ?? null : null,
    });
    return {
      id: t.id,
      mode: t.mode,
      from: endpoint(t.fromStopId, t.depIsHome),
      to: endpoint(t.toStopId, t.arrIsHome),
      depPlace: t.depPlace,
      arrPlace: t.arrPlace,
      depAt: t.depAt ? t.depAt.toISOString() : null,
      arrAt: t.arrAt ? t.arrAt.toISOString() : null,
      departs: local(t.depAt, shown.dep),
      arrives: local(t.arrAt, shown.arr),
      dayDelta: shown.dayDelta,
      reference: t.reference,
      notes: t.notes,
    };
  });

  const travellers: McpTraveller[] = members.map((m) => ({
    name: travellerName(m.user),
    role: m.role === "owner" ? "owner" : "traveller",
    you: m.user.id === user.id,
  }));

  return {
    trip: {
      id: tripId,
      name: trip?.name ?? "",
      startDate: trip?.startDate ?? null,
      endDate: trip?.endDate ?? null,
      hardEndDate: trip?.hardEndDate ?? null,
      homeCurrency: trip?.homeCurrency ?? "AUD",
      homeBase: trip?.homeName ?? null,
      roundTrip: trip?.roundTrip ?? false,
    },
    stops: mcpStops,
    transports,
    chapters: chaptersRaw,
    unplacedDatedItems,
    travellers,
  };
}
