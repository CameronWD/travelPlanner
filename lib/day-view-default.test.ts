import { describe, it, expect } from "vitest";
import { defaultDayISO } from "@/lib/day-view-default";

describe("defaultDayISO (spec decision 3)", () => {
  const trip = { startDate: "2026-12-04", endDate: "2027-01-08" };
  it("is today while travelling", () => {
    expect(defaultDayISO({ ...trip, today: "2026-12-12" })).toBe("2026-12-12");
  });
  it("is the first day before the trip", () => {
    expect(defaultDayISO({ ...trip, today: "2026-09-27" })).toBe("2026-12-04");
  });
  it("is the first day after the trip", () => {
    expect(defaultDayISO({ ...trip, today: "2027-02-01" })).toBe("2026-12-04");
  });
  it("is null for a date-less trip", () => {
    expect(defaultDayISO({ startDate: null, endDate: null, today: "2026-12-12" })).toBeNull();
  });
});
