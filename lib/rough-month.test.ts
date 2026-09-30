import { describe, it, expect } from "vitest";
import { isRoughMonth, roughMonthOptions, formatRoughMonth, roughMonthStamp, roughMonthChip } from "./rough-month";

const TODAY = "2026-09-30";

describe("isRoughMonth", () => {
  it("accepts YYYY-MM with a real month", () => {
    expect(isRoughMonth("2027-04")).toBe(true);
    expect(isRoughMonth("2026-12")).toBe(true);
  });
  it.each(["2027-4", "2027-13", "2027-00", "2027-04-01", "", null, 202704])("rejects %s", (v) => {
    expect(isRoughMonth(v)).toBe(false);
  });
});

describe("roughMonthOptions", () => {
  it("is this month and the eleven after it", () => {
    const opts = roughMonthOptions(TODAY);
    expect(opts).toHaveLength(12);
    expect(opts[0]).toBe("2026-09");
    expect(opts[3]).toBe("2026-12");
    expect(opts[4]).toBe("2027-01");
    expect(opts[11]).toBe("2027-08");
  });
  it("does not skip a month from the 31st", () => {
    expect(roughMonthOptions("2026-01-31").slice(0, 3)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});

describe("formatRoughMonth", () => {
  it("names the month alone inside the next 12 months", () => {
    expect(formatRoughMonth("2027-04", TODAY)).toBe("April");
    expect(formatRoughMonth("2026-09", TODAY)).toBe("September");
  });
  it("adds the year outside them, past or further out", () => {
    expect(formatRoughMonth("2027-09", TODAY)).toBe("September 2027");
    expect(formatRoughMonth("2026-08", TODAY)).toBe("August 2026");
  });
});

describe("roughMonthStamp", () => {
  it("is MON YY", () => {
    expect(roughMonthStamp("2027-04")).toBe("APR 27");
  });
});

describe("roughMonthChip", () => {
  it("is the short month within today's year", () => {
    expect(roughMonthChip("2026-12", TODAY)).toBe("Dec");
  });
  it("adds a short year once it rolls over", () => {
    expect(roughMonthChip("2027-01", TODAY)).toBe("Jan ’27");
  });
});
