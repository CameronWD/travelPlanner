import { describe, expect, it } from "vitest";
import { formatRow, hasAnchor, toleranceKm, verdict } from "@/lib/backfill-places";

const origin = { lat: 35.0, lng: 139.0 };
const eastKm = (km: number) => ({ lat: 35.0, lng: 139.0 + km / (111.32 * Math.cos((35 * Math.PI) / 180)) });

describe("backfill places", () => {
  it("accepts a stop 20 km away, rejects 30 km", () => {
    expect(toleranceKm("stop")).toBe(25);
    expect(verdict("stop", origin, eastKm(20))).toBe("accept");
    expect(verdict("stop", origin, eastKm(30))).toBe("too-far");
  });

  it("tolerance per kind", () => {
    expect(toleranceKm("home")).toBe(25);
    for (const k of ["item", "accommodation", "transport-dep", "transport-arr", "marker"] as const) expect(toleranceKm(k)).toBe(1);
  });

  it("a distance exactly at the tolerance accepts", () => {
    const next = { lat: 35.0, lng: 139.0 };
    expect(verdict("stop", next, next)).toBe("accept");
    expect(verdict("item", { lat: 0, lng: 0 }, { lat: 0, lng: 1 / 111.19492664455873 })).toBe("accept");
  });

  it("an anchor is text or an old point", () => {
    expect(hasAnchor("", null)).toBe(false);
    expect(hasAnchor("   ", null)).toBe(false);
    expect(hasAnchor(null, null)).toBe(false);
    expect(hasAnchor("", origin)).toBe(true);
    expect(hasAnchor("Kyoto", null)).toBe(true);
  });

  it("accepts an item 0.8 km away, rejects 1.2 km", () => {
    expect(toleranceKm("item")).toBe(1);
    expect(verdict("item", origin, eastKm(0.8))).toBe("accept");
    expect(verdict("item", origin, eastKm(1.2))).toBe("too-far");
  });

  it("a row with no old point is new when Google finds it", () => {
    expect(verdict("marker", null, origin)).toBe("new");
  });

  it("no-match when Google finds nothing", () => {
    expect(verdict("item", origin, null)).toBe("no-match");
    expect(verdict("item", null, null)).toBe("no-match");
  });

  it("formatRow prints the exact layout", () => {
    expect(
      formatRow({
        kind: "item",
        id: "c1",
        query: "Ichiran, Shibuya",
        old: { lat: 35.659, lng: 139.7 },
        next: { lat: 35.6595, lng: 139.7005 },
        verdict: "accept",
      }),
    ).toBe('item c1 · "Ichiran, Shibuya" · 35.65900,139.70000 → 35.65950,139.70050 · 0.1 km · ACCEPT');
    expect(formatRow({ kind: "marker", id: "m1", query: "Dinner", old: null, next: null, verdict: "no-anchor" })).toBe(
      'marker m1 · "Dinner" · — → — · — km · NO-ANCHOR',
    );
    expect(
      formatRow({ kind: "home", id: "t1", query: "Leeds", old: null, next: null, verdict: "no-match" }),
    ).toBe('home t1 · "Leeds" · — → — · — km · NO-MATCH');
  });
});
