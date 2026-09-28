import { describe, it, expect } from "vitest";
import { pickMainCluster, projectToBox, sampleDotIndices, sketchModel } from "./route-sketch";

const s = (id: string, lat: number, lng: number, nights: number) => ({ id, name: id, lat, lng, nights });

// Christmas in Europe: Sydney (home, excluded by the caller) → Bali 4n → London … Rome 31n.
const europe = [
  s("Bali", -8.65, 115.13, 4),
  s("London", 51.5, -0.12, 5),
  s("Paris", 48.85, 2.35, 4),
  s("Munich", 48.14, 11.58, 3),
  s("Vienna", 48.2, 16.37, 3),
  s("Venice", 45.44, 12.33, 4),
  s("Florence", 43.77, 11.25, 6),
  s("Rome", 41.9, 12.5, 6),
];

describe("pickMainCluster", () => {
  it("keeps Europe and puts Bali off-frame", () => {
    const r = pickMainCluster(europe)!;
    expect(r.main.map((x) => x.id)).toEqual(["London", "Paris", "Munich", "Vienna", "Venice", "Florence", "Rome"]);
    expect(r.offFrame.map((x) => x.id)).toEqual(["Bali"]);
  });
  it("picks the cluster with the most nights, not the most stops", () => {
    const r = pickMainCluster([s("Tokyo", 35.68, 139.69, 10), s("Kyoto", 35.01, 135.77, 9), s("Paris", 48.85, 2.35, 1), s("Lyon", 45.76, 4.84, 1), s("Nice", 43.7, 7.27, 1)])!;
    expect(r.main.map((x) => x.id)).toEqual(["Tokyo", "Kyoto"]);
  });
  it("breaks a nights tie by stop count, then by earliest", () => {
    const r = pickMainCluster([s("A1", 0, 0, 2), s("B1", 40, 40, 1), s("B2", 40.5, 40.5, 1)])!;
    expect(r.main.map((x) => x.id)).toEqual(["B1", "B2"]);
    const r2 = pickMainCluster([s("A1", 0, 0, 1), s("A2", 0.5, 0.5, 1), s("B1", 40, 40, 1), s("B2", 40.5, 40.5, 1)])!;
    expect(r2.main.map((x) => x.id)).toEqual(["A1", "A2"]);
  });
  it("returns null with fewer than 2 stops in the main cluster", () => {
    expect(pickMainCluster([])).toBeNull();
    expect(pickMainCluster([s("Solo", 0, 0, 3)])).toBeNull();
    expect(pickMainCluster([s("A", 0, 0, 3), s("B", 40, 40, 1)])).toBeNull();
  });
});

describe("projectToBox", () => {
  it("fits inside the padded box and keeps aspect", () => {
    const pts = projectToBox([{ lat: 51.5, lng: -0.12 }, { lat: 41.9, lng: 12.5 }], { w: 100, h: 133, pad: 0.12 });
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(12);
      expect(p.x).toBeLessThanOrEqual(88);
      expect(p.y).toBeGreaterThanOrEqual(133 * 0.12);
      expect(p.y).toBeLessThanOrEqual(133 * 0.88);
    }
    expect(pts[0].y).toBeLessThan(pts[1].y); // north is up
    expect(pts[0].x).toBeLessThan(pts[1].x);
  });
  it("centres a single point", () => {
    expect(projectToBox([{ lat: 10, lng: 10 }], { w: 100, h: 100, pad: 0.12 })).toEqual([{ x: 50, y: 50 }]);
  });
});

describe("sampleDotIndices", () => {
  it("keeps every index up to the cap", () => {
    expect(sampleDotIndices(5)).toEqual([0, 1, 2, 3, 4]);
    expect(sampleDotIndices(14)).toHaveLength(14);
  });
  it("keeps first and last and samples evenly above the cap", () => {
    const idx = sampleDotIndices(30);
    expect(idx).toHaveLength(14);
    expect(idx[0]).toBe(0);
    expect(idx[13]).toBe(29);
    expect(new Set(idx).size).toBe(14);
  });
});

describe("sketchModel", () => {
  it("builds caption, chip and points for Europe", () => {
    const m = sketchModel(europe, { w: 100, h: 133, pad: 0.12 })!;
    expect(m.caption).toBe("London → Rome");
    expect(m.chip).toBe("+ Bali");
    expect(m.points).toHaveLength(7);
    expect(m.dotIndices).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("counts extra off-frame stops in the chip", () => {
    const m = sketchModel([...europe, s("Sydney2", -33.87, 151.2, 2)], { w: 100, h: 100, pad: 0.12 })!;
    expect(m.chip).toBe("+ Bali +1");
  });
  it("has no chip when nothing is off-frame", () => {
    expect(sketchModel(europe.slice(1), { w: 100, h: 100, pad: 0.12 })!.chip).toBeNull();
  });
  it("same-city returns null", () => {
    expect(sketchModel([s("A", 48.85, 2.35, 2), s("B", 48.86, 2.36, 2)], { w: 100, h: 100, pad: 0.12 })).toBeNull();
  });
});
