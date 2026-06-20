import { describe, expect, it } from "vitest";
import {
  parseISODate,
  formatISODate,
  formatDateRange,
  formatLongDate,
  nightsBetween,
  daysBetween,
  addDays,
  isDateWithin,
  todayISO,
} from "./dates";

describe("parseISODate", () => {
  it("parses a valid YYYY-MM-DD string to midnight UTC", () => {
    const d = parseISODate("2026-07-03");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(6); // 0-indexed
    expect(d.getUTCDate()).toBe(3);
    expect(d.getUTCHours()).toBe(0);
  });

  it("throws on bad format", () => {
    expect(() => parseISODate("03/07/2026")).toThrow(RangeError);
    expect(() => parseISODate("2026-7-3")).toThrow(RangeError);
    expect(() => parseISODate("")).toThrow(RangeError);
  });
});

describe("formatISODate", () => {
  it("formats a Date to YYYY-MM-DD in UTC", () => {
    const d = new Date("2026-07-03T00:00:00Z");
    expect(formatISODate(d)).toBe("2026-07-03");
  });

  it("pads single-digit month and day", () => {
    const d = new Date("2026-01-05T00:00:00Z");
    expect(formatISODate(d)).toBe("2026-01-05");
  });
});

describe("formatDateRange", () => {
  it("collapses month and year when same month", () => {
    expect(formatDateRange("2026-07-03", "2026-07-06")).toBe("3–6 Jul 2026");
  });

  it("collapses year when same year but different month", () => {
    expect(formatDateRange("2026-06-28", "2026-07-04")).toBe(
      "28 Jun – 4 Jul 2026"
    );
  });

  it("shows both years when different year", () => {
    expect(formatDateRange("2025-12-28", "2026-01-03")).toBe(
      "28 Dec 2025 – 3 Jan 2026"
    );
  });

  it("works with single-day range", () => {
    expect(formatDateRange("2026-07-03", "2026-07-03")).toBe("3–3 Jul 2026");
  });
});

describe("formatLongDate", () => {
  it("formats a Friday correctly", () => {
    // 3 Jul 2026 is a Friday
    expect(formatLongDate("2026-07-03")).toBe("Fri 3 Jul 2026");
  });

  it("formats a Monday correctly", () => {
    // 1 Jun 2026 is a Monday
    expect(formatLongDate("2026-06-01")).toBe("Mon 1 Jun 2026");
  });
});

describe("nightsBetween", () => {
  it("returns 0 for same-day (no nights)", () => {
    expect(nightsBetween("2026-07-03", "2026-07-03")).toBe(0);
  });

  it("returns 1 for consecutive days", () => {
    expect(nightsBetween("2026-07-03", "2026-07-04")).toBe(1);
  });

  it("returns correct value for multi-day stay", () => {
    expect(nightsBetween("2026-07-03", "2026-07-10")).toBe(7);
  });

  it("returns correct value for cross-month stay", () => {
    expect(nightsBetween("2026-07-28", "2026-08-04")).toBe(7);
  });

  it("returns correct value for a 3-night stay", () => {
    expect(nightsBetween("2026-06-01", "2026-06-04")).toBe(3);
  });

  it("never returns negative (arrive after depart)", () => {
    expect(nightsBetween("2026-07-10", "2026-07-03")).toBe(0);
  });

  it("handles cross-year correctly", () => {
    expect(nightsBetween("2025-12-30", "2026-01-02")).toBe(3);
  });
});

describe("daysBetween", () => {
  it("returns positive when b > a", () => {
    expect(daysBetween("2026-07-01", "2026-07-05")).toBe(4);
  });

  it("returns 0 for same date", () => {
    expect(daysBetween("2026-07-01", "2026-07-01")).toBe(0);
  });

  it("returns negative when b < a", () => {
    expect(daysBetween("2026-07-05", "2026-07-01")).toBe(-4);
  });
});

describe("addDays", () => {
  it("adds days correctly", () => {
    expect(addDays("2026-07-01", 5)).toBe("2026-07-06");
  });

  it("wraps month correctly", () => {
    expect(addDays("2026-07-28", 7)).toBe("2026-08-04");
  });

  it("wraps year correctly", () => {
    expect(addDays("2025-12-30", 5)).toBe("2026-01-04");
  });

  it("handles negative days (subtracting)", () => {
    expect(addDays("2026-07-06", -5)).toBe("2026-07-01");
  });
});

describe("isDateWithin", () => {
  it("returns true for date within range", () => {
    expect(isDateWithin("2026-07-05", "2026-07-01", "2026-07-10")).toBe(true);
  });

  it("returns true for date at start boundary (inclusive)", () => {
    expect(isDateWithin("2026-07-01", "2026-07-01", "2026-07-10")).toBe(true);
  });

  it("returns true for date at end boundary (inclusive)", () => {
    expect(isDateWithin("2026-07-10", "2026-07-01", "2026-07-10")).toBe(true);
  });

  it("returns false for date before range", () => {
    expect(isDateWithin("2026-06-30", "2026-07-01", "2026-07-10")).toBe(false);
  });

  it("returns false for date after range", () => {
    expect(isDateWithin("2026-07-11", "2026-07-01", "2026-07-10")).toBe(false);
  });
});

describe("todayISO", () => {
  it("returns a YYYY-MM-DD string", () => {
    const today = todayISO();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
