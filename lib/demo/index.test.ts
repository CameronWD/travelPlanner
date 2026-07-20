import { describe, it, expect } from "vitest";
import { buildDemo, DEMO_TRIP_NAMES } from "./index";

const today = "2026-07-19";

describe("buildDemo", () => {
  const data = buildDemo(today);
  it("produces six trips and a globe", () => {
    expect(data.trips).toHaveLength(6);
    expect(data.globe.markers.length).toBeGreaterThanOrEqual(12);
  });
  it("every sourceMarkerKey used by a trip resolves to a real globe marker", () => {
    const markerKeys = new Set(data.globe.markers.map((m) => m.key));
    const used = data.trips.flatMap((t) => [...t.items, ...(t.forks ?? []).flatMap((f) => f.items)]).map((i) => i.sourceMarkerKey).filter(Boolean) as string[];
    expect(used.length).toBeGreaterThanOrEqual(2);
    for (const k of used) expect(markerKeys.has(k)).toBe(true);
  });
  it("trip names are unique and exported for the wipe", () => {
    const names = data.trips.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(DEMO_TRIP_NAMES).toContain(n);
  });
  it("the suite covers all six transport modes", () => {
    const modes = new Set(data.trips.flatMap((t) => [...t.transports, ...(t.forks ?? []).flatMap((f) => f.transports)].map((x) => x.mode)));
    const requiredModes = ["FLIGHT", "TRAIN", "BUS", "CAR", "FERRY", "OTHER"] as const;
    for (const m of requiredModes) expect(modes.has(m)).toBe(true);
  });
});
