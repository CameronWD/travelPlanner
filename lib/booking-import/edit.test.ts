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
  it("maps a confirm failure onto the form, keeping the message for a form-level line", () => {
    expect(toActionResult({ ok: true, createdId: "x", createdStops: {} })).toEqual({ success: true });
    expect(toActionResult({ ok: false, message: "Stop name is required", errors: { name: ["Stop name is required"] }, createdStops: {} })).toEqual({ success: false, errors: { _form: ["Stop name is required"], name: ["Stop name is required"] } });
  });
});
