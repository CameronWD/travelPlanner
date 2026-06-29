import { describe, it, expect } from "vitest";
import { summarizePlan } from "./plan-overview";

const stop = (over: Partial<{ id: string; arriveDate: string | null; departDate: string | null; nights: number | null; pinned: boolean; sortOrder: number }>) => ({
  id: "s", arriveDate: null, departDate: null, nights: null, pinned: false, sortOrder: 0, ...over,
});

describe("summarizePlan", () => {
  it("counts stops and splits rough from scheduled", () => {
    const s = summarizePlan({
      stops: [
        stop({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }),
        stop({ id: "b", nights: 3, sortOrder: 1 }),
      ],
      startDate: "2026-07-01",
      hardEndDate: null,
    });
    expect(s.stopCount).toBe(2);
    expect(s.roughCount).toBe(1);
    expect(s.scheduledNights).toBe(4);
    expect(s.projectedNights).toBe(7);
    expect(s.scheduledEnd).toBe("2026-07-05");
    expect(s.projectedEnd).toBe("2026-07-08");
    expect(s.hardEndState).toBe("unset");
  });

  it("flags 'over' when projected end passes the hard end date", () => {
    const s = summarizePlan({
      stops: [stop({ id: "a", nights: 20, sortOrder: 0 })],
      startDate: "2026-07-01",
      hardEndDate: "2026-07-10",
    });
    expect(s.hardEndState).toBe("over");
    expect(s.hardEndSlackNights).toBeLessThan(0);
  });

  it("flags 'approaching' within the window and 'ok' beyond it", () => {
    expect(summarizePlan({ stops: [stop({ id: "a", nights: 8, sortOrder: 0 })], startDate: "2026-07-01", hardEndDate: "2026-07-10" }).hardEndState).toBe("approaching");
    expect(summarizePlan({ stops: [stop({ id: "a", nights: 8, sortOrder: 0 })], startDate: "2026-07-01", hardEndDate: "2026-07-20" }).hardEndState).toBe("ok");
  });

  it("is 'dormant' when a hard end date is set but there's no anchor to project from", () => {
    const s = summarizePlan({ stops: [stop({ id: "a", nights: 3, sortOrder: 0 })], startDate: null, hardEndDate: "2026-07-10" });
    expect(s.projectedEnd).toBeNull();
    expect(s.hardEndState).toBe("dormant");
    expect(s.projectedNights).toBe(3);
  });

  it("falls back spanStart to the earliest scheduled arrive when there is no start date", () => {
    const s = summarizePlan({
      stops: [stop({ id: "a", arriveDate: "2026-08-10", departDate: "2026-08-14", sortOrder: 0 })],
      startDate: null,
      hardEndDate: null,
    });
    expect(s.spanStart).toBe("2026-08-10");
  });

  it("has a null scheduledEnd and zero scheduledNights when every stop is rough", () => {
    const s = summarizePlan({
      stops: [stop({ id: "a", nights: 3, sortOrder: 0 }), stop({ id: "b", nights: 2, sortOrder: 1 })],
      startDate: "2026-07-01",
      hardEndDate: null,
    });
    expect(s.scheduledEnd).toBeNull();
    expect(s.scheduledNights).toBe(0);
    expect(s.roughCount).toBe(2);
  });

  it("a fully scheduled plan has roughCount 0 and scheduledEnd equal to projectedEnd", () => {
    const s = summarizePlan({
      stops: [
        stop({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }),
        stop({ id: "b", arriveDate: "2026-07-05", departDate: "2026-07-09", sortOrder: 1 }),
      ],
      startDate: "2026-07-01",
      hardEndDate: null,
    });
    expect(s.roughCount).toBe(0);
    expect(s.scheduledEnd).toBe("2026-07-09");
    expect(s.projectedEnd).toBe("2026-07-09");
    expect(s.scheduledNights).toBe(s.projectedNights);
  });
});
