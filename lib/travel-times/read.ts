import "server-only";
import {
  planTravelKeys,
  type HopItemRow,
  type HopStopRow,
  type HopTransportRow,
  type Pt,
  type TravelLookup,
} from "@/lib/travel-times/hops";
import { loadTravelTimes } from "@/lib/travel-times/store";

// Keys come only from the rows the caller was allowed to read: a masked viewer's Items never reach here.
export function loadTravelLookupFor(
  input: { items: HopItemRow[]; stops: HopStopRow[]; transports: HopTransportRow[]; home: Pt | null },
  now: Date = new Date(),
): Promise<TravelLookup> {
  return loadTravelTimes([...planTravelKeys(input, now)]);
}
