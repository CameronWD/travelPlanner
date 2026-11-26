import { orderPlanStops } from "@/lib/plan-order";
import { zonedWallTimeToInstant } from "@/lib/tz";
import { addDays } from "@/lib/dates";
import { stopForDate } from "@/lib/itinerary";
import { resolveEndpointZones } from "@/lib/time-display";
import { endZones } from "@/lib/leg-zones";
import type { TransportMode } from "@/lib/enum-values";
import type { LatLng } from "@/lib/geo";

export type NowNext =
  | { kind: "in-transit"; transportId: string; mode: TransportMode; routeLabel: string; arrivesName: string | null; arrivesAt: string; arrivesZone: string }
  | { kind: "next-thing"; target: { type: "item" | "transport" | "accommodation"; id: string }; title: string; startsAt: string | null; zone: string; place: LatLng | null; address: string | null }
  | { kind: "next-departure"; transportId: string; mode: TransportMode; routeLabel: string; departsAt: string; departsZone: string; withinDay: boolean }
  | { kind: "nothing" };

export interface NowNextStop {
  id: string;
  name: string;
  timezone: string | null;
  arriveDate: string | null;
  departDate: string | null;
  sortOrder: number;
}

export interface NowNextTransport {
  id: string;
  mode: TransportMode;
  fromStopId: string | null;
  toStopId: string | null;
  depPlace: string | null;
  arrPlace: string | null;
  depAt: Date | null;
  arrAt: Date | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  depTimezone?: string | null;
  arrTimezone?: string | null;
}

export interface NowNextTimed {
  type: "item" | "accommodation";
  id: string;
  title: string;
  date: string;
  time: string;
  stopId: string | null;
  place: LatLng | null;
  address: string | null;
}

export interface NowNextInput {
  stops: NowNextStop[];
  transports: NowNextTransport[];
  todays: NowNextTimed[];
  home: { name: string | null; timezone: string | null };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function nowNext(input: NowNextInput, now: Date): NowNext {
  const stopById = new Map(input.stops.map((s) => [s.id, s] as const));
  const datedStops = input.stops.flatMap((s) => (s.arriveDate && s.departDate ? [{ ...s, arriveDate: s.arriveDate, departDate: s.departDate }] : []));
  const zones = (t: NowNextTransport) => {
    const { fromTimezone, toTimezone } = endZones(t, (id) => (id ? stopById.get(id)?.timezone : null));
    return resolveEndpointZones(fromTimezone, toTimezone, { depIsHome: t.depIsHome, arrIsHome: t.arrIsHome, homeTimezone: input.home.timezone });
  };
  const endName = (stopId: string | null, place: string | null, isHome: boolean) =>
    (stopId ? stopById.get(stopId)?.name : null) || place || (isHome ? input.home.name : null);
  const label = (t: NowNextTransport) => routeLabel(endName(t.fromStopId, t.depPlace, t.depIsHome), endName(t.toStopId, t.arrPlace, t.arrIsHome));

  const moving = input.transports.find((t) => t.depAt && t.arrAt && t.depAt <= now && now < t.arrAt);
  if (moving) {
    return {
      kind: "in-transit",
      transportId: moving.id,
      mode: moving.mode,
      routeLabel: label(moving),
      arrivesName: endName(moving.toStopId, moving.arrPlace, moving.arrIsHome),
      arrivesAt: moving.arrAt!.toISOString(),
      arrivesZone: zones(moving).arrTz,
    };
  }

  const departure = input.transports
    .filter((t): t is NowNextTransport & { depAt: Date } => t.depAt != null && t.depAt > now)
    .sort((a, b) => a.depAt.getTime() - b.depAt.getTime())[0];

  const thing = input.todays
    .map((t) => {
      const zone = (t.stopId ? stopById.get(t.stopId)?.timezone : stopForDate(datedStops, t.date)?.timezone) || "UTC";
      return { ...t, zone, at: zonedWallTimeToInstant(t.date, t.time, zone) };
    })
    .filter((t) => t.at > now)
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];

  if (thing && (!departure || thing.at < departure.depAt)) {
    return {
      kind: "next-thing",
      target: { type: thing.type, id: thing.id },
      title: thing.title,
      startsAt: thing.at.toISOString(),
      zone: thing.zone,
      place: thing.place,
      address: thing.address,
    };
  }

  if (departure) {
    return {
      kind: "next-departure",
      transportId: departure.id,
      mode: departure.mode,
      routeLabel: label(departure),
      departsAt: departure.depAt.toISOString(),
      departsZone: zones(departure).depTz,
      withinDay: departure.depAt.getTime() - now.getTime() < DAY_MS,
    };
  }

  return { kind: "nothing" };
}

function routeLabel(from: string | null, to: string | null): string {
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `To ${to}`;
  return "";
}

type WhereStop = Pick<NowNextStop, "id" | "name" | "timezone" | "arriveDate" | "departDate" | "sortOrder">;
type WhereTransport = Pick<NowNextTransport, "fromStopId" | "toStopId" | "depAt" | "arrAt">;
type TimedLeg = WhereTransport & { depAt: Date };

const earliestDeparture = (legs: TimedLeg[]) => new Date(Math.min(...legs.map((t) => t.depAt.getTime())));
const landed = (t: TimedLeg) => t.arrAt ?? t.depAt;

// Timed legs beat the calendar: a stay starts when the last leg into it lands and ends when the first
// leg out departs, so a multi-leg day is in transit (null) throughout, whatever order the legs come in.
// Only legs inside the handover count (leaving on or after the start of the depart date, landing
// before the end of the arrive date), so a day trip mid-stay matters only while it is moving.
export function whereYouAre(
  stops: readonly WhereStop[],
  transports: readonly WhereTransport[],
  now: Date,
): { stopId: string; name: string } | null {
  if (transports.some((t) => t.depAt && t.arrAt && t.depAt <= now && now < t.arrAt)) return null;

  const plan = orderPlanStops(stops).filter(
    (s): s is WhereStop & { arriveDate: string; departDate: string } => s.arriveDate != null && s.departDate != null,
  );
  const timed = transports.filter((t): t is TimedLeg => t.depAt != null);
  const dayStart = (dateISO: string, s: WhereStop) => zonedWallTimeToInstant(dateISO, "00:00", s.timezone ?? "UTC");
  const dayEnd = (dateISO: string, s: WhereStop) => dayStart(addDays(dateISO, 1), s);
  const stays = plan.map((s) => ({ stop: s, from: dayStart(s.arriveDate, s), until: dayEnd(s.departDate, s) }));
  // With no arrival time, the arriving stay can't start before its arrive date does.
  const arrivedBy = (legs: TimedLeg[], arriving: (typeof stays)[number]) =>
    new Date(Math.max(...legs.map((t) => t.arrAt?.getTime() ?? Math.max(t.depAt.getTime(), arriving.from.getTime()))));

  const first = stays[0];
  const intoFirst = timed.filter((t) => t.toStopId === first?.stop.id && landed(t) < dayEnd(first.stop.arriveDate, first.stop));
  if (intoFirst.length) first.from = arrivedBy(intoFirst, first);
  for (let i = 1; i < stays.length; i++) {
    const leaving = stays[i - 1];
    const arriving = stays[i];
    const opens = dayStart(leaving.stop.departDate, leaving.stop);
    const closes = dayEnd(arriving.stop.arriveDate, arriving.stop);
    const legs = timed.filter(
      (t) => (t.fromStopId === leaving.stop.id || t.toStopId === arriving.stop.id) && t.depAt >= opens && landed(t) < closes,
    );
    if (legs.length) {
      leaving.until = earliestDeparture(legs);
      arriving.from = arrivedBy(legs, arriving);
    } else if (leaving.stop.departDate === arriving.stop.arriveDate) {
      const noon = zonedWallTimeToInstant(leaving.stop.departDate, "12:00", leaving.stop.timezone ?? "UTC");
      leaving.until = noon;
      arriving.from = noon;
    }
  }
  const last = stays[stays.length - 1];
  const outOfLast = timed.filter((t) => t.fromStopId === last?.stop.id && t.depAt >= dayStart(last.stop.departDate, last.stop));
  if (outOfLast.length) last.until = earliestDeparture(outOfLast);

  const here = stays.findLast((s) => s.from <= now && now < s.until);
  return here ? { stopId: here.stop.id, name: here.stop.name } : null;
}
