import { describe, expect, it } from "vitest";
import { MONTH_GRID_WEEKDAYS, buildMonthGrid } from "./month-grid";

describe("buildMonthGrid", () => {
  it("labels weekdays Monday-first", () => {
    expect(MONTH_GRID_WEEKDAYS).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("every row has exactly 7 days", () => {
    const weeks = buildMonthGrid("2026-07-01");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("pads leading days from the previous month (July 2026 starts on a Wednesday)", () => {
    // 2026-07-01 is a Wednesday → Mon/Tue belong to June and are out-of-month.
    const weeks = buildMonthGrid("2026-07-01");
    const first = weeks[0];
    expect(first[0]).toEqual({ dateISO: "2026-06-29", inMonth: false });
    expect(first[1]).toEqual({ dateISO: "2026-06-30", inMonth: false });
    expect(first[2]).toEqual({ dateISO: "2026-07-01", inMonth: true });
  });

  it("marks the first and last in-month days correctly", () => {
    const weeks = buildMonthGrid("2026-07-15");
    const flat = weeks.flat();
    const inMonth = flat.filter((d) => d.inMonth);
    expect(inMonth[0].dateISO).toBe("2026-07-01");
    expect(inMonth[inMonth.length - 1].dateISO).toBe("2026-07-31");
    expect(inMonth).toHaveLength(31);
  });

  it("trailing padding comes from the next month", () => {
    const weeks = buildMonthGrid("2026-07-01");
    const last = weeks[weeks.length - 1];
    const lastCell = last[last.length - 1];
    expect(lastCell.inMonth).toBe(false);
    expect(lastCell.dateISO.startsWith("2026-08")).toBe(true);
  });
});
