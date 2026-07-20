import { buildGlobe } from "./globe";
import { buildEuTrip } from "./eu-trip";
import { buildAlpineTrip } from "./alpine-trip";
import { buildSketchTrip, buildFinalPrepTrip, buildTravellingTrip, buildPastTrip } from "./phase-trips";
import type { DemoDataset } from "./types";

export function buildDemo(today: string): DemoDataset {
  return {
    globe: buildGlobe(),
    trips: [buildEuTrip(), buildAlpineTrip(), buildSketchTrip(), buildFinalPrepTrip(today), buildTravellingTrip(today), buildPastTrip(today)],
  };
}
export const DEMO_TRIP_NAMES = buildDemo("2000-01-01").trips.map((t) => t.name);
