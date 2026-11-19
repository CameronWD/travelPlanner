import { describe, expect, it } from "vitest";
import { summariseShifts, type ShiftEntry } from "./loading";

const shift = (t: number, value: number, input = false): ShiftEntry => ({ t, value, input, sources: [] });

describe("summariseShifts", () => {
  it("a page that never moves scores 0", () => expect(summariseShifts([])).toEqual({ cls: 0, total: 0, shifts: 0, largest: [] }));
  it("CLS is the worst burst, not the sum of separate bursts", () => {
    const s = summariseShifts([shift(100, 0.1), shift(300, 0.05), shift(4000, 0.08)]);
    expect(s.cls).toBe(0.15);
    expect(s.total).toBe(0.23);
    expect(s.shifts).toBe(3);
  });
  it("leaves out shifts that follow input", () => expect(summariseShifts([shift(100, 0.4, true), shift(200, 0.01)]).cls).toBe(0.01));
  it("lists the largest shifts first", () =>
    expect(summariseShifts([shift(1, 0.01), shift(2, 0.2), shift(3, 0.05)]).largest.map((l) => l.value)).toEqual([0.2, 0.05, 0.01]));
});
