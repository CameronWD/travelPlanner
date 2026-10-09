/**
 * `get_trip_plan`'s loader (spec 2026-10-09, Task 9). Mirrors the Plan
 * editor's queries (`app/(app)/trips/[tripId]/plan/page.tsx`), trimmed to
 * what a Claude connection needs to read and reason about the Plan — no
 * Costs, no Attachments, no edit-time bookkeeping. Real plan only: every
 * query is scoped with `REAL_PLAN`, never `resolvePlan`, and this never
 * accepts a `forkId`.
 */
import { requireTripAccess } from "@/lib/guards";
import { db } from "@/lib/db";
import { REAL_PLAN, THINGS_TO_DO_WHERE } from "@/lib/plan-scope";
import { orderPlanStops } from "@/lib/plan-order";
import { buildStopDays, groupScheduledItemsByStop, type StopDayItem } from "@/lib/stop-days";
import { loadDayTitles } from "@/lib/day-titles-loader";

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
  accommodations: McpAccommodation[];
  thingsToDo: McpThingToDo[];
  days: McpStopDay[];
}

export type McpTransportEndpoint = { home: true } | { stopId: string; name: string } | null;

export interface McpTransport {
  id: string;
  mode: string;
  from: McpTransportEndpoint;
  to: McpTransportEndpoint;
  /** ISO datetime, or null while not yet timed. */
  depAt: string | null;
  arrAt: string | null;
  reference: string | null;
}

export interface McpChapter {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
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
  await requireTripAccess(tripId);

  const [trip, stopsRaw, transportsRaw, chaptersRaw, thingsToDoItems, scheduledItems] = await Promise.all([
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
        depAt: true,
        arrAt: true,
        reference: true,
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

  const transports: McpTransport[] = transportsRaw.map((t) => ({
    id: t.id,
    mode: t.mode,
    from: endpoint(t.fromStopId, t.depIsHome),
    to: endpoint(t.toStopId, t.arrIsHome),
    depAt: t.depAt ? t.depAt.toISOString() : null,
    arrAt: t.arrAt ? t.arrAt.toISOString() : null,
    reference: t.reference,
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
  };
}
