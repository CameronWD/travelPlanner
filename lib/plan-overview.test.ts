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
      deadline: null,
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
      deadline: { kind: "hard-end", date: "2026-07-10" },
    });
    expect(s.hardEndState).toBe("over");
    expect(s.hardEndSlackNights).toBeLessThan(0);
  });

  it("flags 'approaching' within the window and 'ok' beyond it", () => {
    expect(summarizePlan({ stops: [stop({ id: "a", nights: 8, sortOrder: 0 })], startDate: "2026-07-01", deadline: { kind: "hard-end", date: "2026-07-10" } }).hardEndState).toBe("approaching");
    expect(summarizePlan({ stops: [stop({ id: "a", nights: 8, sortOrder: 0 })], startDate: "2026-07-01", deadline: { kind: "hard-end", date: "2026-07-20" } }).hardEndState).toBe("ok");
  });

  it("measures slack against a return-leg deadline (ADR 0068)", () => {
    const s = summarizePlan({
      stops: [stop({ id: "a", nights: 8, sortOrder: 0 })], // projected end 07-09
      startDate: "2026-07-01",
      deadline: { kind: "return-leg", date: "2026-07-08", mode: "FLIGHT", homeward: true },
    });
    expect(s.hardEndState).toBe("over");
    expect(s.hardEndSlackNights).toBe(-1);
    expect(s.deadline).toEqual({ kind: "return-leg", date: "2026-07-08", mode: "FLIGHT", homeward: true });
  });

  it("R7: a dated return leg is never 'approaching' — slack >= 0 is 'ok', only slack < 0 is 'over'", () => {
    // projected end 07-08, deadline 07-08 → slack 0 (today 'approaching' for hard-end, must be 'ok' here)
    const atDeadline = summarizePlan({
      stops: [stop({ id: "a", nights: 7, sortOrder: 0 })],
      startDate: "2026-07-01",
      deadline: { kind: "return-leg", date: "2026-07-08", mode: "FLIGHT", homeward: true },
    });
    expect(atDeadline.hardEndState).toBe("ok");
    expect(atDeadline.hardEndSlackNights).toBe(0);

    // slack 1, well inside the hard-end approaching window — still 'ok' for a return leg
    const oneSpare = summarizePlan({
      stops: [stop({ id: "a", nights: 6, sortOrder: 0 })],
      startDate: "2026-07-01",
      deadline: { kind: "return-leg", date: "2026-07-08", mode: "FLIGHT", homeward: true },
    });
    expect(oneSpare.hardEndState).toBe("ok");
  });

  it("is 'dormant' when a hard end date is set but there's no anchor to project from", () => {
    const s = summarizePlan({ stops: [stop({ id: "a", nights: 3, sortOrder: 0 })], startDate: null, deadline: { kind: "hard-end", date: "2026-07-10" } });
    expect(s.projectedEnd).toBeNull();
    expect(s.hardEndState).toBe("dormant");
    expect(s.projectedNights).toBe(3);
  });

  it("falls back spanStart to the earliest scheduled arrive when there is no start date", () => {
    const s = summarizePlan({
      stops: [stop({ id: "a", arriveDate: "2026-08-10", departDate: "2026-08-14", sortOrder: 0 })],
      startDate: null,
      deadline: null,
    });
    expect(s.spanStart).toBe("2026-08-10");
  });

  it("has a null scheduledEnd and zero scheduledNights when every stop is rough", () => {
    const s = summarizePlan({
      stops: [stop({ id: "a", nights: 3, sortOrder: 0 }), stop({ id: "b", nights: 2, sortOrder: 1 })],
      startDate: "2026-07-01",
      deadline: null,
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
      deadline: null,
    });
    expect(s.roughCount).toBe(0);
    expect(s.scheduledEnd).toBe("2026-07-09");
    expect(s.projectedEnd).toBe("2026-07-09");
    expect(s.scheduledNights).toBe(s.projectedNights);
  });
});
