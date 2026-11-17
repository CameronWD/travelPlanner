import { describe, it, expect } from "vitest";
import { clockTime, rainAngleDeg, SCATTER_W, sunArcPosition } from "@/lib/weather/scene-math";

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
  // 140px tall below md, regular 863px wide at 236px tall from md to lg.
  const compactUnits = (719 * 236) / 140;
  it("covers the widest card at both heights, with a margin", () => {
    expect(SCATTER_W).toBeGreaterThanOrEqual(compactUnits + 20);
    expect(SCATTER_W).toBeGreaterThanOrEqual(863 + 20);
  });
  it("stays well short of the whole 2400-unit world strip", () => {
    expect(SCATTER_W).toBeLessThan(compactUnits + 100);
  });
});
