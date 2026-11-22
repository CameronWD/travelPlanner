import { describe, expect, it } from "vitest";
import {
  MAX_SNAPSHOT_PINS,
  SNAPSHOT_SIZE,
  decodeSnapshotPins,
  encodeSnapshotPins,
  routeSnapshotModel,
  routeSnapshotPath,
} from "./route-snapshot";
import type { SketchStop } from "./route-sketch";

const s = (id: string, lat: number, lng: number, sortOrder: number, nights = 3): SketchStop => ({ id, name: id, lat, lng, nights, sortOrder });
const denpasar = s("Denpasar", -8.65, 115.2, 0);
const munich = s("Munich", 48.14, 11.58, 1);
const strasbourg = s("Strasbourg", 48.57, 7.75, 2);
const frankfurt = s("Frankfurt", 50.11, 8.68, 3);

describe("routeSnapshotModel", () => {
  it("is null for no stops, one stop, and stops all within 5 km", () => {
    expect(routeSnapshotModel([])).toBeNull();
    expect(routeSnapshotModel([munich])).toBeNull();
    expect(routeSnapshotModel([s("a", 48.14, 11.58, 0), s("b", 48.15, 11.59, 1)])).toBeNull();
  });

  it("pins the main cluster, numbered by position in the input, and chips the rest", () => {
    const m = routeSnapshotModel([denpasar, munich, strasbourg, frankfurt])!;
    expect(m.pins.map((p) => [p.sortOrder, p.number])).toEqual([[1, 2], [2, 3], [3, 4]]);
    expect(m.caption).toBe("Munich → Frankfurt");
    expect(m.chip).toBe("+ Denpasar");
  });

  it("counts further off-frame stops in the chip", () => {
    const sydney = s("Sydney", -33.87, 151.2, 4);
    const m = routeSnapshotModel([denpasar, munich, strasbourg, frankfurt, sydney])!;
    expect(m.chip).toBe("+ Denpasar +1");
  });

  it("only pins coordinates of input stops", () => {
    const input = [denpasar, munich, strasbourg, frankfurt];
    const m = routeSnapshotModel(input)!;
    for (const p of m.pins) expect(input.some((st) => st.lat === p.lat && st.lng === p.lng)).toBe(true);
  });
});

describe("snapshot pin encoding", () => {
  it("round-trips with coordinates at four decimals", () => {
    const pins = [
      { lat: 48.123456, lng: 11.987654, sortOrder: 1, number: 2 },
      { lat: -8.65, lng: 115.2, sortOrder: 2, number: 3 },
    ];
    expect(decodeSnapshotPins(encodeSnapshotPins(pins))).toEqual(
      pins.map((p) => ({ ...p, lat: Math.round(p.lat * 1e4) / 1e4, lng: Math.round(p.lng * 1e4) / 1e4 })),
    );
  });

  it.each([
    ["null", null],
    ["empty", ""],
    ["non-numeric", "a,1,1,1"],
    ["lat too high", "91,1,1,1"],
    ["lat too low", "-91,1,1,1"],
    ["lng too high", "1,181,1,1"],
    ["lng too low", "1,-181,1,1"],
    ["negative sortOrder", "1,1,-1,1"],
    ["fractional sortOrder", "1,1,1.5,1"],
    ["negative number", "1,1,1,-1"],
    ["fractional number", "1,1,1,2.5"],
    ["missing field", "1,1,1"],
  ])("rejects %s", (_n, raw) => {
    expect(decodeSnapshotPins(raw)).toBeNull();
  });

  it("rejects more than the pin cap", () => {
    const pin = (i: number) => ({ lat: 1, lng: 1, sortOrder: i, number: i + 1 });
    const ok = Array.from({ length: MAX_SNAPSHOT_PINS }, (_, i) => pin(i));
    expect(decodeSnapshotPins(encodeSnapshotPins(ok))).toHaveLength(MAX_SNAPSHOT_PINS);
    expect(decodeSnapshotPins(encodeSnapshotPins([...ok, pin(MAX_SNAPSHOT_PINS)]))).toBeNull();
  });
});

describe("routeSnapshotPath", () => {
  it("carries the shape and the encoded pins", () => {
    const model = routeSnapshotModel([denpasar, munich, strasbourg, frankfurt])!;
    expect(routeSnapshotPath("t1", model, "band")).toBe(
      `/api/trips/t1/route-snapshot?shape=band&p=${encodeURIComponent(encodeSnapshotPins(model.pins))}`,
    );
  });

  it("sizes the three shapes", () => {
    expect(SNAPSHOT_SIZE).toEqual({
      tall: { width: 480, height: 640 },
      square: { width: 400, height: 400 },
      band: { width: 640, height: 360 },
    });
  });
});
