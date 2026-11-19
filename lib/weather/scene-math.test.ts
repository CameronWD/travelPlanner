import { describe, it, expect } from "vitest";
import { clockTime, rainAngleDeg, SCATTER_W, sceneClip, sunArcPosition, textZones } from "@/lib/weather/scene-math";

describe("rainAngleDeg", () => {
  it("falls straight when calm or unknown", () => {
    expect(rainAngleDeg(null)).toBe(0);
    expect(rainAngleDeg(10)).toBe(0);
  });
  it("leans linearly from 15 km/h to 30 degrees at 60, then holds", () => {
    expect(rainAngleDeg(37.5)).toBeCloseTo(15);
    expect(rainAngleDeg(60)).toBe(30);
    expect(rainAngleDeg(90)).toBe(30);
  });
});

describe("sunArcPosition", () => {
  const rise = clockTime("08:00");
  const set = clockTime("16:00");
  it("runs 0 at sunrise to 1 at sunset", () => {
    expect(sunArcPosition(rise, set, rise)).toBe(0);
    expect(sunArcPosition(rise, set, clockTime("12:00"))).toBe(0.5);
    expect(sunArcPosition(rise, set, set)).toBe(1);
  });
  it("is null before sunrise and after sunset", () => {
    expect(sunArcPosition(rise, set, clockTime("07:59"))).toBeNull();
    expect(sunArcPosition(rise, set, clockTime("21:00"))).toBeNull();
  });
});

describe("clockTime", () => {
  it("reads a place-local HH:MM the same whatever the server's zone", () => {
    expect(clockTime("08:12").getTime() - clockTime("00:00").getTime()).toBe((8 * 60 + 12) * 60_000);
  });
});

describe("SCATTER_W", () => {
  // The widest weather cards (day/[date]/page.tsx): compact 719px wide at
  // 140px tall below md, regular 863px wide at 236px tall from md to lg. The
  // scene is drawn on the padding box, 4px narrower and 4px shorter.
  const compactUnits = ((719 - 4) * 236) / 136;
  const regularUnits = ((863 - 4) * 236) / 232;
  it("covers the widest card at both heights, with a margin", () => {
    expect(SCATTER_W).toBeGreaterThanOrEqual(compactUnits + 20);
    expect(SCATTER_W).toBeGreaterThanOrEqual(regularUnits + 20);
  });
  it("stays well short of the whole 2400-unit world strip", () => {
    expect(SCATTER_W).toBeLessThan(compactUnits + 100);
  });
});

describe("sceneClip", () => {
  const SCENES = ["sunny", "partly", "overcast", "fog", "rain", "snow", "storm", "wind", "heat", "night"] as const;
  const SIZES = ["regular", "compact"] as const;
  const PX = { regular: 232 / 236, compact: 136 / 236 };

  it.each(SIZES)("%s: one block right of the widest words, with no open band above or below the text", (size) => {
    for (const scene of SCENES) {
      const zones = textZones(scene, size);
      const widest = Math.max(...zones.filter((z) => Number.isFinite(z.right)).map((z) => z.right)) * PX[size];
      const points = sceneClip(scene, size).replace(/^polygon\(|\)$/g, "").split(", ");
      expect(points).toHaveLength(4);
      const lefts = points.map((p) => p.split(" ")[0]).filter((v) => v !== "100%").map((v) => parseFloat(v));
      expect(lefts).toHaveLength(2);
      for (const left of lefts) expect(left).toBeGreaterThanOrEqual(Number(widest.toFixed(1)));
      const tops = points.map((p) => parseFloat(p.split(" ")[1]));
      const label = zones.find((z) => z.top === 0 && z.right === Number.POSITIVE_INFINITY);
      expect(Math.min(...tops)).toBeCloseTo(label ? (label.bottom / 236) * 100 : 0, 1);
      expect(Math.max(...tops)).toBeCloseTo((166 / 236) * 100, 1);
    }
  });
});
