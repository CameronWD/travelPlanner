import { describe, expect, it } from "vitest";
import { mergeStopEdit, mergeTransportEdit, toActionResult } from "./edit";

describe("mergeTransportEdit", () => {
  it("keeps an end's zone hint while that end is unchanged, and drops it once the end changes", () => {
    const prev = { mode: "FLIGHT" as const, depIsHome: true, depTimezone: "Australia/Sydney", arrPlace: "Singapore Changi (SIN)", arrTimezone: "Asia/Singapore" };
    expect(mergeTransportEdit(prev, { mode: "FLIGHT", depIsHome: true, arrPlace: "Singapore Changi (SIN)", reference: "X" })).toEqual({ ...prev, reference: "X" });
    expect(mergeTransportEdit(prev, { mode: "FLIGHT", depIsHome: true, toStopId: "s-lis" })).toEqual({ mode: "FLIGHT", depIsHome: true, depTimezone: "Australia/Sydney", toStopId: "s-lis" });
  });

  it("restores the hint when an end goes back to the original place (merged against the original, fix round 1)", () => {
    const original = { mode: "FLIGHT" as const, depIsHome: true, depTimezone: "Australia/Sydney", arrPlace: "Singapore Changi (SIN)", arrTimezone: "Asia/Singapore" };
    const cleared = mergeTransportEdit(original, { mode: "FLIGHT", depIsHome: true });
    expect(cleared).not.toHaveProperty("arrTimezone");
    expect(mergeTransportEdit(original, { mode: "FLIGHT", depIsHome: true, arrPlace: "Singapore Changi (SIN)" })).toMatchObject({ arrTimezone: "Asia/Singapore" });
  });
});

describe("mergeTransportEdit on a Stop end (final review #1)", () => {
  const prev = { mode: "FLIGHT" as const, fromStopId: "s-syd", toStopId: "s-rough", arrPlace: "Lisbon (LIS)", arrTimezone: "Europe/Lisbon", arrAt: "2026-07-02T07:15" };
  it("keeps the hint while the Stop is unchanged, even when the place within it or the time is edited", () => {
    expect(mergeTransportEdit(prev, { mode: "FLIGHT", fromStopId: "s-syd", toStopId: "s-rough", arrPlace: "LIS T1", arrAt: "2026-07-02T08:00" })).toEqual({
      mode: "FLIGHT", fromStopId: "s-syd", toStopId: "s-rough", arrPlace: "LIS T1", arrAt: "2026-07-02T08:00", arrTimezone: "Europe/Lisbon",
    });
  });
  it("drops it once the Stop changes, or the end leaves the Stop", () => {
    expect(mergeTransportEdit(prev, { mode: "FLIGHT", fromStopId: "s-syd", toStopId: "s-other", arrAt: "2026-07-02T07:15" })).not.toHaveProperty("arrTimezone");
    expect(mergeTransportEdit(prev, { mode: "FLIGHT", fromStopId: "s-syd", arrPlace: "Lisbon (LIS)", arrAt: "2026-07-02T07:15" })).not.toHaveProperty("arrTimezone");
  });
});

describe("mergeStopEdit", () => {
  const prev = { mode: "scheduled" as const, name: "Lisbon", country: "Portugal", countryCode: "PT", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-15" };
  it("keeps the import's country code while the place is unchanged", () => {
    expect(mergeStopEdit(prev, { ...prev, countryCode: undefined, departDate: "2026-12-16" })).toEqual({ ...prev, departDate: "2026-12-16" });
  });
  it("drops it once the place changes", () => {
    const { countryCode: _drop, ...rest } = prev;
    void _drop;
    expect(mergeStopEdit(prev, { ...rest, name: "Porto" })).toEqual({ ...rest, name: "Porto" });
  });
});

describe("toActionResult", () => {
  it("passes a confirm result through unchanged — it is already an ActionResult (ADR 0074)", () => {
    expect(toActionResult({ success: true, createdId: "x", createdStops: {} })).toEqual({ success: true, createdId: "x", createdStops: {} });
    expect(
      toActionResult({ success: false, errors: { _: ["Stop name is required"], name: ["Stop name is required"] }, createdStops: {} }),
    ).toEqual({ success: false, errors: { _: ["Stop name is required"], name: ["Stop name is required"] }, createdStops: {} });
  });
});
