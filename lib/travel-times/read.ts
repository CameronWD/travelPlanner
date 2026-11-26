import "server-only";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { driveTimeOf, type DriveTime } from "@/lib/travel-times/drive-fit";
import {
  carLegs,
  hopStopsById,
  homePointOf,
  legPathKeys,
  resolveDriveLeg,
  samePoint,
  toPlanTransport,
  planTravelKeys,
  routeLegPaths,
  type RouteLegStop,
  type HopItemRow,
  type HopModeChoice,
  type HopStopRow,
  type HopTransportRow,
  type Pt,
  type Selected,
  type TravelLookup,
} from "@/lib/travel-times/hops";
import type { StartAccommodationRow } from "@/lib/travel-times/day-start";
import { loadTravelTimes } from "@/lib/travel-times/store";

// Keys come only from the rows the caller was allowed to read: a masked viewer's Items never reach here.

export function loadTravelLookupFor(
  input: {
    items: Selected<HopItemRow>[];
    stops: Selected<HopStopRow>[];
    transports: Selected<HopTransportRow>[];
    home: Pt | null;
    hopModes?: ReadonlyMap<string, HopModeChoice>;
    accommodations?: StartAccommodationRow[];
  },
  now: Date = new Date(),
): Promise<TravelLookup> {
  return loadTravelTimes([...planTravelKeys(input, now, { purpose: "read" })]);
}

export async function loadRouteLegPaths(
  stops: Selected<RouteLegStop>[],
  transports: Selected<HopTransportRow>[],
  home: Pt | null,
): Promise<Record<string, string>> {
  const keys = legPathKeys(stops, transports, home);
  if (keys.length === 0) return {};
  return routeLegPaths(stops, transports, await loadTravelTimes(keys), home);
}

// A drive's ends are resolved only from Stops the reader may see: a hidden Surprise Stop is left out, so its drives report null.
export async function loadDriveTimes(tripId: string, hiddenStopIds: readonly string[] = []): Promise<Map<string, DriveTime>> {
  const [trip, stopRows, transports] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { homeLat: true, homeLng: true, drivingWindingFactor: true, drivingAvgSpeedKph: true } }),
    db.stop.findMany({ where: { tripId, ...REAL_PLAN, id: { notIn: [...hiddenStopIds] } }, select: { id: true, lat: true, lng: true } }),
    db.transport.findMany({
      where: { tripId, ...REAL_PLAN, mode: "CAR" },
      select: { id: true, mode: true, fromStopId: true, toStopId: true, depLat: true, depLng: true, arrLat: true, arrLng: true, depIsHome: true, arrIsHome: true },
    }),
  ]);
  const times = new Map<string, DriveTime>();
  if (!trip) return times;
  const home = homePointOf(trip);
  const lookup = await loadTravelTimes(legPathKeys(stopRows, transports, home));
  const estimateOpts = { windingFactor: trip.drivingWindingFactor, avgSpeedKph: trip.drivingAvgSpeedKph };
  for (const leg of carLegs(transports.map(toPlanTransport), hopStopsById(stopRows), home)) {
    if (samePoint(leg.from, leg.to)) continue;
    times.set(leg.transportId, driveTimeOf(resolveDriveLeg(leg.from, leg.to, lookup, estimateOpts), trip.drivingWindingFactor));
  }
  return times;
}
