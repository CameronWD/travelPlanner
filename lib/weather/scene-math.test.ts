import { describe, it, expect } from "vitest";
import { clockTime, rainAngleDeg, SCATTER_W, sceneClip, sunArcPosition, textZones, wordsReach } from "@/lib/weather/scene-math";

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
  it("leaves the label line out across the whole regular card and the daylight strip out at both sizes", () => {
    const regular = sceneClip("snow", "regular");
    expect(regular).toMatch(/^polygon\(100% 0%, 100% 72\.88%, /);
    expect(regular).toContain(", 100% 18.22%, ");
    expect(regular).toMatch(/, 100% 0\.00%\)$/);
    expect(sceneClip("snow", "compact")).toMatch(/^polygon\(100% 0%, 100% 72\.88%, /);
  });
  it("steps out past the widest words of each row, in pixels of the canvas", () => {
    const zones = textZones("partly", "compact");
    const reach = wordsReach(zones, 120, 130);
    expect(reach).toBe(448 + 8);
    expect(sceneClip("partly", "compact")).toContain(`${(reach * (136 / 236)).toFixed(1)}px`);
  });
});
