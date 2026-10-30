import "server-only";
import {
  legPathKeys,
  planTravelKeys,
  routeLegPaths,
  type RouteLegStop,
  type HopItemRow,
  type HopStopRow,
  type HopTransportRow,
  type Pt,
  type Selected,
  type TravelLookup,
} from "@/lib/travel-times/hops";
import { loadTravelTimes } from "@/lib/travel-times/store";

// Keys come only from the rows the caller was allowed to read: a masked viewer's Items never reach here.

export function loadTravelLookupFor(
  input: { items: Selected<HopItemRow>[]; stops: Selected<HopStopRow>[]; transports: Selected<HopTransportRow>[]; home: Pt | null },
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
