import { describe, expect, it } from "vitest";
import { openingHoursFromGoogle, parseGooglePeriods, type GooglePeriod } from "./opening-hours-google";
import { openingHoursSchema } from "@/lib/validations/opening-hours";

const p = (d: number, h: number, m: number, cd: number, ch: number, cm: number): GooglePeriod => ({
  open: { day: d, hour: h, minute: m },
  close: { day: cd, hour: ch, minute: cm },
});

function check(periods: GooglePeriod[], source?: string) {
  const result = openingHoursFromGoogle(periods, source);
  if (result) expect(openingHoursSchema.safeParse(result).success).toBe(true);
  return result;
}

describe("openingHoursFromGoogle", () => {
  it("maps a simple Mon–Fri 9–17 week and marks the weekend closed", () => {
    const r = check([1, 2, 3, 4, 5].map((d) => p(d, 9, 0, d, 17, 0)));
    expect(r?.week).toEqual({
      sun: [], mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]],
      thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]], sat: [],
    });
    expect(r?.seasons).toEqual([]);
    expect(r?.closed).toEqual([]);
  });

  it("splits an 18:00–02:00 Friday into Friday to 24:00 and Saturday from 00:00", () => {
    const r = check([p(5, 18, 0, 6, 2, 0)]);
    expect(r?.week.fri).toEqual([["18:00", "24:00"]]);
    expect(r?.week.sat).toEqual([["00:00", "02:00"]]);
    expect(r?.week.mon).toEqual([]);
  });

  it("wraps Saturday night into Sunday", () => {
    const r = check([p(6, 22, 0, 0, 3, 0)]);
    expect(r?.week.sat).toEqual([["22:00", "24:00"]]);
    expect(r?.week.sun).toEqual([["00:00", "03:00"]]);
  });

  it("ends a span closing at next-day midnight at 24:00 without an empty span", () => {
    const r = check([p(1, 10, 0, 2, 0, 0)]);
    expect(r?.week.mon).toEqual([["10:00", "24:00"]]);
    expect(r?.week.tue).toEqual([]);
  });

  it("24/7 single period → every day 00:00–24:00", () => {
    const r = check([{ open: { day: 0, hour: 0, minute: 0 } }]);
    for (const d of ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const) {
      expect(r?.week[d]).toEqual([["00:00", "24:00"]]);
    }
  });

  it("lunch + dinner → two spans, sorted", () => {
    const r = check([p(2, 18, 0, 2, 22, 0), p(2, 11, 30, 2, 14, 0)]);
    expect(r?.week.tue).toEqual([["11:30", "14:00"], ["18:00", "22:00"]]);
  });

  it("merges exactly-touching spans", () => {
    const r = check([p(1, 8, 0, 1, 12, 0), p(1, 12, 0, 1, 17, 0)]);
    expect(r?.week.mon).toEqual([["08:00", "17:00"]]);
  });

  it("an overnight carry-over plus lunch and dinner is three spans → null", () => {
    expect(
      check([p(0, 22, 0, 1, 2, 0), p(1, 11, 0, 1, 14, 0), p(1, 18, 0, 1, 22, 0)]),
    ).toBeNull();
  });

  it("three spans on a day → null", () => {
    expect(check([p(3, 8, 0, 3, 10, 0), p(3, 12, 0, 3, 14, 0), p(3, 16, 0, 3, 18, 0)])).toBeNull();
  });

  it("a lone period with no close that is not 24/7 → null", () => {
    expect(check([{ open: { day: 2, hour: 9, minute: 0 } }])).toBeNull();
  });

  it("no periods → null", () => {
    expect(openingHoursFromGoogle([])).toBeNull();
    expect(openingHoursFromGoogle(null)).toBeNull();
    expect(openingHoursFromGoogle(undefined)).toBeNull();
  });

  it("sets source when given", () => {
    const src = "https://www.google.com/maps/search/?api=1&query=ChIJ&query_place_id=ChIJ";
    expect(check([p(1, 9, 0, 1, 17, 0)], src)?.source).toBe(src);
    expect(check([p(1, 9, 0, 1, 17, 0)])).not.toHaveProperty("source");
  });

  it("a period whose open equals its close is null, not a week-long wrap", () => {
    expect(check([p(1, 9, 0, 1, 9, 0)])).toBeNull();
  });

  it("splits a multi-midnight span across three days", () => {
    const r = check([p(5, 20, 0, 0, 2, 0)]);
    expect(r?.week.fri).toEqual([["20:00", "24:00"]]);
    expect(r?.week.sat).toEqual([["00:00", "24:00"]]);
    expect(r?.week.sun).toEqual([["00:00", "02:00"]]);
    expect(r?.week.mon).toEqual([]);
  });

  it("collapses duplicate periods", () => {
    expect(check([p(1, 9, 0, 1, 17, 0), p(1, 9, 0, 1, 17, 0)])?.week.mon).toEqual([["09:00", "17:00"]]);
  });

  it("gives the same result for out-of-order periods", () => {
    const ordered = [p(1, 9, 0, 1, 12, 0), p(1, 14, 0, 1, 18, 0), p(3, 10, 0, 3, 16, 0)];
    expect(check([ordered[2], ordered[0], ordered[1]])).toEqual(check(ordered));
  });
});

describe("parseGooglePeriods", () => {
  it("treats an omitted minute as 0", () => {
    const periods = parseGooglePeriods([{ open: { day: 1, hour: 9 }, close: { day: 1, hour: 17 } }]);
    expect(check(periods!)?.week.mon).toEqual([["09:00", "17:00"]]);
  });

  it("treats an omitted day as Sunday", () => {
    const periods = parseGooglePeriods([{ open: { hour: 10 }, close: { hour: 14 } }]);
    expect(check(periods!)?.week.sun).toEqual([["10:00", "14:00"]]);
  });

  it("reads the 24/7 open-only period with everything omitted", () => {
    const periods = parseGooglePeriods([{ open: {} }]);
    expect(check(periods!)?.week.sat).toEqual([["00:00", "24:00"]]);
  });

  it("a period missing open → null", () => {
    expect(parseGooglePeriods([{ close: { day: 1, hour: 17 } }])).toBeNull();
  });

  it("a non-number field → null", () => {
    expect(parseGooglePeriods([{ open: { day: 1, hour: "9" }, close: { day: 1, hour: 17 } }])).toBeNull();
    expect(parseGooglePeriods([{ open: { day: 1, hour: 9 }, close: { day: 1, hour: null } }])).toBeNull();
  });

  it("non-array input → null", () => {
    expect(parseGooglePeriods(undefined)).toBeNull();
    expect(parseGooglePeriods({})).toBeNull();
  });
});
