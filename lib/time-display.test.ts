// lib/time-display.test.ts
import { describe, it, expect } from "vitest";
import { zoneLabel, shortDate, transportTimeDisplay } from "./time-display";

describe("zoneLabel", () => {
  it("falls back to UTC when the zone is missing/invalid", () => {
    expect(zoneLabel(null, "2026-08-05")).toBe("UTC");
    expect(zoneLabel(undefined, "2026-08-05")).toBe("UTC");
    expect(zoneLabel("Not/AZone", "2026-08-05")).toBe("UTC");
  });
  it("returns a non-empty abbreviation for a real zone", () => {
    const label = zoneLabel("Australia/Sydney", "2026-01-01");
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe("UTC");
  });
});

describe("shortDate", () => {
  it("formats an ISO date as day + short month", () => {
    expect(shortDate("2026-08-05")).toBe("5 Aug");
  });
});

describe("transportTimeDisplay", () => {
  it("labels both ends in their own zone and flags a +1 day arrival", () => {
    const td = transportTimeDisplay({
      depAt: new Date("2026-08-05T18:00:00Z"), // 20:00 in Europe/Rome (CEST)
      arrAt: new Date("2026-08-06T07:30:00Z"), // 16:30 next day in Asia/Tokyo (JST)
      fromTimezone: "Europe/Rome",
      toTimezone: "Asia/Tokyo",
    });
    expect(td.dep).toMatchObject({ time: "20:00", dateISO: "2026-08-05" });
    expect(td.arr).toMatchObject({ time: "16:30", dateISO: "2026-08-06" });
    expect(td.dayDelta).toBe(1);
    expect(td.dep!.zone.length).toBeGreaterThan(0);
    expect(td.arr!.zone.length).toBeGreaterThan(0);
  });
  it("uses UTC labels when a zone is unknown and returns null ends for missing instants", () => {
    const td = transportTimeDisplay({ depAt: new Date("2026-08-05T18:00:00Z"), arrAt: null, fromTimezone: null, toTimezone: null });
    expect(td.dep).toMatchObject({ zone: "UTC" });
    expect(td.arr).toBeNull();
    expect(td.dayDelta).toBe(0);
  });
});
