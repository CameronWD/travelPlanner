import { describe, it, expect } from "vitest";
import { tripStatusLine } from "./trip-status-line";

const START = "2026-12-04";
const END = "2027-01-08";

describe("tripStatusLine", () => {
  it("counts down in sleeps before final-prep", () => {
    expect(tripStatusLine({ startDate: START, endDate: END, today: "2026-09-27" })).toBe(
      "68 sleeps to go",
    );
  });

  it("singular sleep the night before", () => {
    expect(tripStatusLine({ startDate: START, endDate: END, today: "2026-12-03" })).toBe(
      "1 sleep to go",
    );
  });

  it("Day 1 of N (inclusive day count) on the start date", () => {
    expect(tripStatusLine({ startDate: START, endDate: END, today: "2026-12-04" })).toBe(
      "Day 1 of 36",
    );
  });

  it("Day 5 of N mid-trip", () => {
    expect(tripStatusLine({ startDate: START, endDate: END, today: "2026-12-08" })).toBe(
      "Day 5 of 36",
    );
  });

  // Fix round 1: the denominator is an inclusive day count
  // (daysBetween(start, end) + 1, same as describePhase), so the last day of
  // the trip reads "Day 36 of 36", never "Day 36 of 35".
  it("Day N of N (not N+1 of N-1) on the trip's last day", () => {
    expect(tripStatusLine({ startDate: START, endDate: END, today: "2027-01-08" })).toBe(
      "Day 36 of 36",
    );
  });

  it("Back home after the trip ends", () => {
    expect(tripStatusLine({ startDate: START, endDate: END, today: "2027-01-09" })).toBe(
      "Back home",
    );
  });

  it("No dates yet for a date-less trip", () => {
    expect(tripStatusLine({ startDate: null, endDate: null, today: "2026-09-27" })).toBe(
      "No dates yet",
    );
  });

  it("Today for a same-day trip, on the day", () => {
    expect(tripStatusLine({ startDate: "2026-12-04", endDate: "2026-12-04", today: "2026-12-04" })).toBe(
      "Today",
    );
  });
});
