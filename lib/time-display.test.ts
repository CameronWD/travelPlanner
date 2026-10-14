// lib/time-display.test.ts
import { describe, it, expect } from "vitest";
import { zoneLabel, shortDate, transportTimeDisplay, resolveEndpointZones, instantToWallTimeInput } from "./time-display";

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
  it("labels the dep zone with the arrival stop's zone on a home-departure leg (fromTimezone null)", () => {
    // Regression: depTz falls back to toTimezone, but the zone LABEL must too —
    // otherwise a home-departure leg renders the arrival stop's local time
    // mislabelled "UTC".
    const td = transportTimeDisplay({
      depAt: new Date("2026-07-01T06:00:00Z"), // 08:00 in Europe/Paris (CEST)
      arrAt: null,
      fromTimezone: null,
      toTimezone: "Europe/Paris",
    });
    // Zone abbreviation text is ICU-data-dependent (this runtime emits "GMT+2"
    // rather than "CEST" for Europe/Paris); what matters for the regression is
    // that it reflects Paris, not the "UTC" fallback the bug produced.
    expect(td.dep).toMatchObject({ time: "08:00", zone: "GMT+2" });
  });
});

describe("resolveEndpointZones", () => {
  it("uses each endpoint's own zone, falling back to the other, then UTC", () => {
    expect(resolveEndpointZones("Europe/Paris", "Europe/Rome"))
      .toEqual({ depTz: "Europe/Paris", arrTz: "Europe/Rome" });
    expect(resolveEndpointZones(null, "Europe/Rome"))
      .toEqual({ depTz: "Europe/Rome", arrTz: "Europe/Rome" }); // home → first stop leg
    expect(resolveEndpointZones("Europe/Paris", null))
      .toEqual({ depTz: "Europe/Paris", arrTz: "Europe/Paris" }); // return leg
    expect(resolveEndpointZones(null, null)).toEqual({ depTz: "UTC", arrTz: "UTC" });
  });
});

describe("instantToWallTimeInput", () => {
  it("formats an instant as the zone's wall clock regardless of process TZ", () => {
    expect(instantToWallTimeInput(new Date("2026-07-01T06:00:00Z"), "Europe/Paris"))
      .toBe("2026-07-01T08:00");
    expect(instantToWallTimeInput(null, "Europe/Paris")).toBe("");
  });
});

describe("resolveEndpointZones with a Home zone", () => {
  it("a Home departure uses the Home zone, the Stop end keeps its own", () => {
    expect(resolveEndpointZones(null, "Asia/Makassar", { depIsHome: true, homeTimezone: "Australia/Brisbane" }))
      .toEqual({ depTz: "Australia/Brisbane", arrTz: "Asia/Makassar" });
  });
  it("a Home arrival uses the Home zone", () => {
    expect(resolveEndpointZones("Europe/Rome", null, { arrIsHome: true, homeTimezone: "Australia/Brisbane" }))
      .toEqual({ depTz: "Europe/Rome", arrTz: "Australia/Brisbane" });
  });
  it("falls back to the far end when homeTz is null", () => {
    expect(resolveEndpointZones(null, "Asia/Makassar", { depIsHome: true, homeTimezone: null }))
      .toEqual({ depTz: "Asia/Makassar", arrTz: "Asia/Makassar" });
  });
  it("ignores the Home zone on a non-Home end", () => {
    expect(resolveEndpointZones(null, "Europe/Rome", { homeTimezone: "Australia/Brisbane" }))
      .toEqual({ depTz: "Europe/Rome", arrTz: "Europe/Rome" });
  });
  it("is unchanged with no third argument", () => {
    expect(resolveEndpointZones(null, null)).toEqual({ depTz: "UTC", arrTz: "UTC" });
  });
});

describe("transportTimeDisplay on Home legs", () => {
  it("Gold Coast → Denpasar departs 17:50 AEST", () => {
    const d = transportTimeDisplay({
      depAt: new Date("2026-12-04T07:50:00Z"), arrAt: new Date("2026-12-04T14:15:00Z"),
      fromTimezone: null, toTimezone: "Asia/Makassar", depIsHome: true, homeTimezone: "Australia/Brisbane",
    });
    expect(d.dep).toEqual({ time: "17:50", zone: zoneLabel("Australia/Brisbane", "2026-12-04"), dateISO: "2026-12-04" });
    expect(d.arr?.time).toBe("22:15");
  });
  it("Rome → Brisbane lands 17:30 AEST the next day", () => {
    const d = transportTimeDisplay({
      depAt: new Date("2027-01-07T07:55:00Z"), arrAt: new Date("2027-01-08T07:30:00Z"),
      fromTimezone: "Europe/Rome", toTimezone: null, arrIsHome: true, homeTimezone: "Australia/Brisbane",
    });
    expect(d.arr).toEqual({ time: "17:30", zone: zoneLabel("Australia/Brisbane", "2027-01-08"), dateISO: "2027-01-08" });
    expect(d.dayDelta).toBe(1);
  });
});
