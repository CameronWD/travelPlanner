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
// Every keying field required (nullable): a loader that forgets to select one fails to compile instead of silently estimating.
type Selected<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

export function loadTravelLookupFor(
  input: { items: Selected<HopItemRow>[]; stops: Selected<HopStopRow>[]; transports: Selected<HopTransportRow>[]; home: Pt | null },
  now: Date = new Date(),
): Promise<TravelLookup> {
  return loadTravelTimes([...planTravelKeys(input, now, { purpose: "read" })]);
}
