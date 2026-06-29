import { describe, it, expect } from "vitest";
import { projectStops } from "./route-render";

describe("projectStops", () => {
  it("returns empty for no stops", () => {
    expect(projectStops([], 100, 60, 8)).toEqual([]);
  });

  it("centres a single stop", () => {
    const pts = projectStops([{ lat: 10, lng: 20 }], 100, 60, 8);
    expect(pts).toHaveLength(1);
    expect(pts[0].x).toBeCloseTo(50);
    expect(pts[0].y).toBeCloseTo(30);
  });

  it("maps the bounding box into the padded viewbox, north-up", () => {
    // SW corner (low lat, low lng) and NE corner (high lat, high lng).
    const pts = projectStops(
      [{ lat: 0, lng: 0 }, { lat: 10, lng: 10 }],
      100, 100, 10,
    );
    // lng 0 -> left+pad ; lng 10 -> right-pad
    expect(pts[0].x).toBeCloseTo(10);
    expect(pts[1].x).toBeCloseTo(90);
    // Higher latitude is further NORTH => smaller y (top). lat 10 -> top+pad.
    expect(pts[1].y).toBeCloseTo(10);
    expect(pts[0].y).toBeCloseTo(90);
  });

  it("keeps all points within [pad, size-pad]", () => {
    const pts = projectStops(
      [{ lat: -20, lng: 100 }, { lat: 50, lng: -30 }, { lat: 5, lng: 5 }],
      200, 120, 12,
    );
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(12 - 0.001);
      expect(p.x).toBeLessThanOrEqual(200 - 12 + 0.001);
      expect(p.y).toBeGreaterThanOrEqual(12 - 0.001);
      expect(p.y).toBeLessThanOrEqual(120 - 12 + 0.001);
    }
  });
});
