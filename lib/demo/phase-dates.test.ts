import { describe, it, expect } from "vitest";
import { phaseDates } from "./phase-dates";
import { computeTripPhase } from "@/lib/trip-phase";

const today = "2026-07-19";

describe("phaseDates", () => {
  const d = phaseDates(today);
  it("final-prep range resolves to the final-prep phase", () => {
    expect(computeTripPhase({ startDate: d.finalPrep.start, endDate: d.finalPrep.end, today })).toBe("final-prep");
  });
  it("travelling range spans today", () => {
    expect(computeTripPhase({ startDate: d.travelling.start, endDate: d.travelling.end, today })).toBe("travelling");
  });
  it("past range is over", () => {
    expect(computeTripPhase({ startDate: d.past.start, endDate: d.past.end, today })).toBe("past");
  });
});
