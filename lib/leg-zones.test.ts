import { describe, expect, it } from "vitest";
import { endZones } from "./leg-zones";

const zones: Record<string, string | null> = { dps: "Asia/Makassar", lis: "Europe/Lisbon", bare: null };
const stopZone = (id: string | null | undefined) => (id ? zones[id] : undefined);

describe("endZones", () => {
  it("a Stop's zone wins over a stored zone", () => {
    expect(endZones({ fromStopId: "dps", toStopId: "lis", depTimezone: "Asia/Bangkok", arrTimezone: "Asia/Tokyo" }, stopZone))
      .toEqual({ fromTimezone: "Asia/Makassar", toTimezone: "Europe/Lisbon" });
  });

  it("a place end with a stored zone uses it", () => {
    expect(endZones({ fromStopId: "dps", toStopId: null, arrTimezone: "Asia/Bangkok" }, stopZone))
      .toEqual({ fromTimezone: "Asia/Makassar", toTimezone: "Asia/Bangkok" });
  });

  it("an end with neither is null", () => {
    expect(endZones({ fromStopId: null, toStopId: "bare", depTimezone: null, arrTimezone: null }, stopZone))
      .toEqual({ fromTimezone: null, toTimezone: null });
    expect(endZones({}, stopZone)).toEqual({ fromTimezone: null, toTimezone: null });
  });

  it("each end is decided on its own", () => {
    expect(endZones({ fromStopId: null, toStopId: "lis", depTimezone: "Asia/Bangkok", arrTimezone: null }, stopZone))
      .toEqual({ fromTimezone: "Asia/Bangkok", toTimezone: "Europe/Lisbon" });
  });
});
