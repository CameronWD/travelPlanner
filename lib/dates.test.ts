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
  clampISODate,
  suggestNextStopDates,
  addMonths,
  startOfMonthISO,
  endOfMonthISO,
  formatMonthYear,
  monthKey,
  tzAbbrev,
  dayNumberInTrip,
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

describe("clampISODate", () => {
  it("returns the date when within bounds", () => {
    expect(clampISODate("2026-07-04", "2026-07-01", "2026-07-12")).toBe(
      "2026-07-04",
    );
  });
  it("clamps to min when before the range", () => {
    expect(clampISODate("2026-06-20", "2026-07-01", "2026-07-12")).toBe(
      "2026-07-01",
    );
  });
  it("clamps to max when after the range", () => {
    expect(clampISODate("2026-08-01", "2026-07-01", "2026-07-12")).toBe(
      "2026-07-12",
    );
  });
  it("ignores nullish bounds", () => {
    expect(clampISODate("2026-07-04", null, null)).toBe("2026-07-04");
    expect(clampISODate("2026-06-01", "2026-07-01", null)).toBe("2026-07-01");
  });
});

describe("suggestNextStopDates", () => {
  const start = "2026-07-01";
  const end = "2026-07-12";

  it("defaults to the trip start when there are no stops", () => {
    expect(suggestNextStopDates([], start, end)).toEqual({
      arriveDate: start,
      departDate: start,
    });
  });

  it("picks up where the latest stop departs", () => {
    const stops = [
      { departDate: "2026-07-05", sortOrder: 0 },
      { departDate: "2026-07-09", sortOrder: 1 },
    ];
    expect(suggestNextStopDates(stops, start, end)).toEqual({
      arriveDate: "2026-07-09",
      departDate: "2026-07-09",
    });
  });

  it("uses sortOrder (not array order) to find the latest stop", () => {
    const stops = [
      { departDate: "2026-07-09", sortOrder: 1 },
      { departDate: "2026-07-05", sortOrder: 0 },
    ];
    expect(suggestNextStopDates(stops, start, end).arriveDate).toBe(
      "2026-07-09",
    );
  });

  it("clamps a previous depart that runs past the trip end", () => {
    const stops = [{ departDate: "2026-07-20", sortOrder: 0 }];
    expect(suggestNextStopDates(stops, start, end)).toEqual({
      arriveDate: end,
      departDate: end,
    });
  });

  it("returns empty strings when there is no trip start to anchor to", () => {
    expect(suggestNextStopDates([], undefined, undefined)).toEqual({
      arriveDate: "",
      departDate: "",
    });
  });
});

describe("month helpers", () => {
  it("startOfMonthISO returns the first of the month", () => {
    expect(startOfMonthISO("2026-07-14")).toBe("2026-07-01");
  });

  it("endOfMonthISO returns the last day (July = 31)", () => {
    expect(endOfMonthISO("2026-07-14")).toBe("2026-07-31");
  });

  it("endOfMonthISO handles February in a non-leap year", () => {
    expect(endOfMonthISO("2026-02-10")).toBe("2026-02-28");
  });

  it("addMonths rolls forward across a year boundary", () => {
    expect(addMonths("2026-11-01", 2)).toBe("2027-01-01");
  });

  it("addMonths rolls backward", () => {
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("addMonths clamps the day when the target month is shorter", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("addMonths clamps a leap-day to Feb 28 when the target year is not a leap year", () => {
    // 2024 is a leap year; +12 months lands in 2025 (non-leap) → clamp 29→28.
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
  });

  it("formatMonthYear renders a human label", () => {
    expect(formatMonthYear("2026-07-01")).toBe("July 2026");
  });

  it("monthKey returns YYYY-MM", () => {
    expect(monthKey("2026-07-14")).toBe("2026-07");
  });
});

describe("tzAbbrev", () => {
  it("returns a short zone name for a valid IANA zone on a given date", () => {
    // Brisbane has no DST → AEST year-round.
    expect(tzAbbrev("Australia/Brisbane", "2026-07-01")).toBe("AEST");
  });
  it("returns null for a missing or invalid zone", () => {
    expect(tzAbbrev(null, "2026-07-01")).toBeNull();
    expect(tzAbbrev("Not/AZone", "2026-07-01")).toBeNull();
  });
});

describe("dayNumberInTrip", () => {
  it("is 1 on the trip start date", () => {
    expect(dayNumberInTrip("2026-06-26", "2026-06-26")).toBe(1);
  });
  it("counts inclusive days from the start", () => {
    expect(dayNumberInTrip("2026-06-30", "2026-06-26")).toBe(5);
  });
});
