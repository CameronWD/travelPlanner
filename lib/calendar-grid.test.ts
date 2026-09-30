import { describe, it, expect } from "vitest";
import { monthCells, nextRange, dayState, isDayDisabled, shiftDay, addMonthKey } from "./calendar-grid";

describe("monthCells", () => {
  it("starts on Monday and pads to whole weeks", () => {
    const cells = monthCells("2026-12"); // 1 Dec 2026 is a Tuesday
    expect(cells[0]).toBeNull();
    expect(cells[1]).toBe("2026-12-01");
    expect(cells).toContain("2026-12-31");
    expect(cells.length % 7).toBe(0);
  });
  it("needs no lead padding when the 1st is a Monday", () => {
    expect(monthCells("2027-02")[0]).toBe("2027-02-01");
  });
});

describe("nextRange", () => {
  it("first pick starts, second ends", () => {
    expect(nextRange({}, "2026-12-04")).toEqual({ start: "2026-12-04" });
    expect(nextRange({ start: "2026-12-04" }, "2027-01-08")).toEqual({ start: "2026-12-04", end: "2027-01-08" });
  });
  it("a pick before the start restarts", () => {
    expect(nextRange({ start: "2026-12-04" }, "2026-12-01")).toEqual({ start: "2026-12-01" });
  });
  it("a pick after a finished range restarts", () => {
    expect(nextRange({ start: "2026-12-04", end: "2026-12-08" }, "2026-12-10")).toEqual({ start: "2026-12-10" });
  });
  it("the same day twice is a same-day trip", () => {
    expect(nextRange({ start: "2026-12-04" }, "2026-12-04")).toEqual({ start: "2026-12-04", end: "2026-12-04" });
  });
});

describe("dayState", () => {
  const r = { start: "2026-12-04", end: "2026-12-08" };
  it("marks start, in, end and outside", () => {
    expect(dayState("2026-12-04", r)).toBe("start");
    expect(dayState("2026-12-06", r)).toBe("in");
    expect(dayState("2026-12-08", r)).toBe("end");
    expect(dayState("2026-12-09", r)).toBe("none");
  });
  it("a same-day range is single", () => {
    expect(dayState("2026-12-04", { start: "2026-12-04", end: "2026-12-04" })).toBe("single");
  });
  it("previews the band up to the hovered day before the end is picked", () => {
    expect(dayState("2026-12-04", { start: "2026-12-04" }, "2026-12-06")).toBe("start");
    expect(dayState("2026-12-05", { start: "2026-12-04" }, "2026-12-06")).toBe("preview");
    expect(dayState("2026-12-06", { start: "2026-12-04" }, "2026-12-06")).toBe("preview");
    expect(dayState("2026-12-04", { start: "2026-12-04" })).toBe("single");
  });
});

describe("isDayDisabled", () => {
  it("disables strictly before and strictly after", () => {
    expect(isDayDisabled("2026-09-30", "2026-10-01")).toBe(true);
    expect(isDayDisabled("2026-10-01", "2026-10-01")).toBe(false);
    expect(isDayDisabled("2026-10-01", undefined, "2026-09-30")).toBe(true);
    expect(isDayDisabled("2026-09-30", undefined, "2026-09-30")).toBe(false);
  });
});

describe("shiftDay / addMonthKey", () => {
  it("moves by a day or a week", () => {
    expect(shiftDay("2026-12-31", "ArrowRight")).toBe("2027-01-01");
    expect(shiftDay("2026-12-04", "ArrowUp")).toBe("2026-11-27");
    expect(shiftDay("2026-12-04", "Tab")).toBeNull();
  });
  it("pages months across the year", () => {
    expect(addMonthKey("2026-12", 1)).toBe("2027-01");
    expect(addMonthKey("2026-01", -1)).toBe("2025-12");
  });
});
