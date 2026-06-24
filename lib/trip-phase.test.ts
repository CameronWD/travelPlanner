import { describe, expect, it } from "vitest";
import {
  computeTripPhase,
  describePhase,
  PHASE_RANK,
  compareForTripList,
} from "./trip-phase";

describe("computeTripPhase", () => {
  it("is sketching when there is no start date", () => {
    expect(computeTripPhase({ startDate: null, endDate: null, today: "2026-06-24" })).toBe("sketching");
    expect(computeTripPhase({ startDate: null, endDate: "2026-07-01", today: "2026-06-24" })).toBe("sketching");
  });

  it("is planning when start is more than 14 days away", () => {
    expect(computeTripPhase({ startDate: "2026-07-20", endDate: "2026-07-30", today: "2026-06-24" })).toBe("planning");
  });

  it("is final-prep within 14 days before start (inclusive)", () => {
    expect(computeTripPhase({ startDate: "2026-07-08", endDate: "2026-07-20", today: "2026-06-24" })).toBe("final-prep");
  });

  it("is travelling between start and end inclusive", () => {
    expect(computeTripPhase({ startDate: "2026-06-20", endDate: "2026-06-30", today: "2026-06-24" })).toBe("travelling");
    expect(computeTripPhase({ startDate: "2026-06-24", endDate: "2026-06-30", today: "2026-06-24" })).toBe("travelling");
    expect(computeTripPhase({ startDate: "2026-06-20", endDate: "2026-06-24", today: "2026-06-24" })).toBe("travelling");
  });

  it("is past after the end date", () => {
    expect(computeTripPhase({ startDate: "2026-06-01", endDate: "2026-06-10", today: "2026-06-24" })).toBe("past");
  });

  it("treats a missing end date as the start date for boundaries", () => {
    expect(computeTripPhase({ startDate: "2026-06-24", endDate: null, today: "2026-06-24" })).toBe("travelling");
    expect(computeTripPhase({ startDate: "2026-06-20", endDate: null, today: "2026-06-24" })).toBe("past");
  });
});

describe("describePhase", () => {
  it("labels and counts down upcoming trips in days", () => {
    const d = describePhase({ startDate: "2026-07-20", endDate: "2026-07-30", today: "2026-06-24" });
    expect(d.phase).toBe("planning");
    expect(d.label).toBe("Planning");
    expect(d.countdown).toBe("In 26 days");
  });

  it("says Tomorrow at one day out", () => {
    expect(describePhase({ startDate: "2026-06-25", endDate: "2026-07-01", today: "2026-06-24" }).countdown).toBe("Tomorrow");
  });

  it("labels final prep", () => {
    expect(describePhase({ startDate: "2026-07-01", endDate: "2026-07-10", today: "2026-06-24" }).label).toBe("Final prep");
  });

  it("counts down in days during final prep", () => {
    expect(describePhase({ startDate: "2026-07-01", endDate: "2026-07-10", today: "2026-06-24" }).countdown).toBe("In 7 days");
  });

  it("shows day X of N while travelling", () => {
    const d = describePhase({ startDate: "2026-06-20", endDate: "2026-06-30", today: "2026-06-24" });
    expect(d.label).toBe("Travelling");
    expect(d.countdown).toBe("Day 5 of 11");
  });

  it("describes sketching and past", () => {
    expect(describePhase({ startDate: null, endDate: null, today: "2026-06-24" })).toMatchObject({ label: "Sketching", countdown: "Not dated yet" });
    expect(describePhase({ startDate: "2026-06-01", endDate: "2026-06-10", today: "2026-06-24" })).toMatchObject({ label: "Past", countdown: "Ended 14 days ago" });
  });
});

describe("compareForTripList", () => {
  it("orders travelling, final-prep, planning (soonest first), sketching, then past", () => {
    const today = "2026-06-24";
    const trips = [
      { id: "past", startDate: "2026-01-01", endDate: "2026-01-10", createdAt: new Date("2026-01-01") },
      { id: "sketch", startDate: null, endDate: null, createdAt: new Date("2026-06-01") },
      { id: "planning-late", startDate: "2026-09-01", endDate: "2026-09-10", createdAt: new Date("2026-02-01") },
      { id: "planning-soon", startDate: "2026-08-01", endDate: "2026-08-10", createdAt: new Date("2026-02-01") },
      { id: "travelling", startDate: "2026-06-20", endDate: "2026-06-30", createdAt: new Date("2026-03-01") },
      { id: "final", startDate: "2026-07-01", endDate: "2026-07-10", createdAt: new Date("2026-03-01") },
    ];
    const ordered = [...trips].sort((a, b) => compareForTripList(a, b, today)).map((t) => t.id);
    expect(ordered).toEqual(["travelling", "final", "planning-soon", "planning-late", "sketch", "past"]);
  });

  it("exposes a stable phase rank", () => {
    expect(PHASE_RANK.travelling).toBeLessThan(PHASE_RANK.planning);
    expect(PHASE_RANK.sketching).toBeLessThan(PHASE_RANK.past);
  });
});
