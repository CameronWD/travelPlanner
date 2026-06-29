import { describe, expect, it } from "vitest";
import { daylight } from "./daylight";

/**
 * Helper: parse an "HH:MM" UTC string to total minutes since midnight.
 */
function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

describe("daylight", () => {
  describe("London (51.5074, -0.1278) on 2026-06-21 (summer solstice)", () => {
    const result = daylight(51.5074, -0.1278, "2026-06-21");

    it("is not polar day or polar night", () => {
      expect(result.polarDay).toBe(false);
      expect(result.polarNight).toBe(false);
    });

    it("returns non-null sunrise and sunset strings", () => {
      expect(result.sunriseUTC).not.toBeNull();
      expect(result.sunsetUTC).not.toBeNull();
    });

    it("sunrise is approximately 03:43 UTC (±6 min)", () => {
      const sunriseMin = hhmmToMin(result.sunriseUTC!);
      const expectedMin = hhmmToMin("03:43");
      expect(Math.abs(sunriseMin - expectedMin)).toBeLessThanOrEqual(6);
    });

    it("sunset is approximately 20:21 UTC (±6 min)", () => {
      const sunsetMin = hhmmToMin(result.sunsetUTC!);
      const expectedMin = hhmmToMin("20:21");
      expect(Math.abs(sunsetMin - expectedMin)).toBeLessThanOrEqual(6);
    });

    it("dayLengthMin is approximately 996 (±15)", () => {
      expect(Math.abs(result.dayLengthMin - 996)).toBeLessThanOrEqual(15);
    });
  });

  describe("Rovaniemi (66.5, 25.73) on 2026-06-21 (midnight sun / polar day)", () => {
    const result = daylight(66.5, 25.73, "2026-06-21");

    it("reports polarDay: true", () => {
      expect(result.polarDay).toBe(true);
    });

    it("polarNight is false", () => {
      expect(result.polarNight).toBe(false);
    });

    it("sunriseUTC is null", () => {
      expect(result.sunriseUTC).toBeNull();
    });

    it("sunsetUTC is null", () => {
      expect(result.sunsetUTC).toBeNull();
    });

    it("dayLengthMin is 1440 (full day)", () => {
      expect(result.dayLengthMin).toBe(1440);
    });
  });

  describe("Equator (0, 0) on 2026-03-20 (vernal equinox)", () => {
    const result = daylight(0, 0, "2026-03-20");

    it("is not polar day or polar night", () => {
      expect(result.polarDay).toBe(false);
      expect(result.polarNight).toBe(false);
    });

    it("dayLengthMin is approximately 720 (±20)", () => {
      expect(Math.abs(result.dayLengthMin - 720)).toBeLessThanOrEqual(20);
    });
  });

  describe("edge cases", () => {
    it("returns polarNight: true for North Pole in December", () => {
      const result = daylight(90, 0, "2026-12-21");
      expect(result.polarNight).toBe(true);
      expect(result.polarDay).toBe(false);
      expect(result.sunriseUTC).toBeNull();
      expect(result.sunsetUTC).toBeNull();
      expect(result.dayLengthMin).toBe(0);
    });

    it("returns polarDay: true for North Pole in June", () => {
      const result = daylight(90, 0, "2026-06-21");
      expect(result.polarDay).toBe(true);
      expect(result.polarNight).toBe(false);
      expect(result.sunriseUTC).toBeNull();
      expect(result.sunsetUTC).toBeNull();
      expect(result.dayLengthMin).toBe(1440);
    });
  });
});
