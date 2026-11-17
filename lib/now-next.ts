import { orderPlanStops } from "@/lib/plan-order";
import { instantToZonedDateISO, zonedWallTimeToInstant } from "@/lib/tz";
import { resolveEndpointZones } from "@/lib/time-display";
import type { TransportMode } from "@/lib/enum-values";
import type { LatLng } from "@/lib/geo";

export type NowNext =
  | { kind: "in-transit"; transportId: string; mode: TransportMode; routeLabel: string; arrivesAt: string; arrivesZone: string }
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
  const zones = (t: NowNextTransport) =>
    resolveEndpointZones(
      t.fromStopId ? stopById.get(t.fromStopId)?.timezone : null,
      t.toStopId ? stopById.get(t.toStopId)?.timezone : null,
      { depIsHome: t.depIsHome, arrIsHome: t.arrIsHome, homeTimezone: input.home.timezone },
    );
  const label = (t: NowNextTransport) => routeLabel(t, stopById, input.home.name);

  const moving = input.transports.find((t) => t.depAt && t.arrAt && t.depAt <= now && now < t.arrAt);
  if (moving) {
    return {
      kind: "in-transit",
      transportId: moving.id,
      mode: moving.mode,
      routeLabel: label(moving),
      arrivesAt: moving.arrAt!.toISOString(),
      arrivesZone: zones(moving).arrTz,
    };
  }

  const departure = input.transports
    .filter((t): t is NowNextTransport & { depAt: Date } => t.depAt != null && t.depAt > now)
    .sort((a, b) => a.depAt.getTime() - b.depAt.getTime())[0];

  const thing = input.todays
    .map((t) => {
      const zone = (t.stopId && stopById.get(t.stopId)?.timezone) || "UTC";
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

function routeLabel(t: NowNextTransport, stopById: Map<string, NowNextStop>, homeName: string | null): string {
  const end = (stopId: string | null, place: string | null, isHome: boolean) =>
    (stopId ? stopById.get(stopId)?.name : null) || place || (isHome ? homeName : null);
  const from = end(t.fromStopId, t.depPlace, t.depIsHome);
  const to = end(t.toStopId, t.arrPlace, t.arrIsHome);
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `To ${to}`;
  return "";
}

type WhereStop = Pick<NowNextStop, "id" | "name" | "timezone" | "arriveDate" | "departDate" | "sortOrder">;
type WhereTransport = Pick<NowNextTransport, "fromStopId" | "toStopId" | "depAt">;

export function whereYouAre(
  stops: readonly WhereStop[],
  transports: readonly WhereTransport[],
  now: Date,
): { stopId: string; name: string } | null {
  const covering = orderPlanStops(stops).filter((s) => {
    if (!s.arriveDate || !s.departDate) return false;
    const day = instantToZonedDateISO(now, s.timezone ?? "UTC");
    return s.arriveDate <= day && day <= s.departDate;
  });
  if (covering.length === 0) return null;

  let here = covering[0];
  for (const arriving of covering.slice(1)) {
    const leg =
      transports.find((t) => t.fromStopId === here.id && t.toStopId === arriving.id) ??
      transports.find((t) => t.fromStopId === here.id || t.toStopId === arriving.id);
    const leaves = leg?.depAt ?? zonedWallTimeToInstant(here.departDate!, "12:00", here.timezone ?? "UTC");
    if (now < leaves) break;
    here = arriving;
  }
  return { stopId: here.id, name: here.name };
}
