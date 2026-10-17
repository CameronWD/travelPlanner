import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { OpeningHours } from "@/lib/opening-hours";
import { openingHoursSchema, parseOpeningHours, serializeOpeningHours } from "./opening-hours";

const VALID = {
  week: { mon: [], tue: [["10:00", "18:00"]], fri: [["10:00", "13:00"], ["14:00", "24:00"]] },
  seasons: [{ label: "Winter", from: "11-01", to: "03-31", week: { sat: [] } }],
  closed: ["12-25", "2027-01-12"],
  source: "https://example.com/hours",
};
const ok = (v: unknown) => openingHoursSchema.safeParse(v).success;
const withWeek = (week: unknown) => ({ week });

describe("openingHoursSchema", () => {
  it("parses to the OpeningHours model", () => {
    expectTypeOf<z.output<typeof openingHoursSchema>>().toExtend<OpeningHours>();
    expect(openingHoursSchema.parse(VALID)).toEqual(VALID);
  });

  it("defaults seasons and closed dates to none", () => {
    expect(openingHoursSchema.parse({ week: { mon: [] } })).toEqual({ week: { mon: [] }, seasons: [], closed: [] });
  });

  it("allows one or two ordered spans a day, closing at 24:00 at the latest", () => {
    expect(ok(withWeek({ tue: [["00:00", "24:00"]] }))).toBe(true);
    expect(ok(withWeek({ tue: [["09:00", "12:00"], ["12:00", "17:00"]] }))).toBe(true); // touching is fine
    expect(ok(withWeek({ tue: [["09:00", "10:00"], ["11:00", "12:00"], ["13:00", "14:00"]] }))).toBe(false); // three
    expect(ok(withWeek({ tue: [["14:00", "18:00"], ["09:00", "12:00"]] }))).toBe(false); // out of order
    expect(ok(withWeek({ tue: [["09:00", "13:00"], ["12:00", "17:00"]] }))).toBe(false); // overlapping
    expect(ok(withWeek({ tue: [["18:00", "10:00"]] }))).toBe(false); // closes before it opens
    expect(ok(withWeek({ tue: [["10:00", "10:00"]] }))).toBe(false); // empty span
    expect(ok(withWeek({ tue: [["24:00", "24:00"]] }))).toBe(false); // 24:00 is a close only
    expect(ok(withWeek({ tue: [["9:00", "17:00"]] }))).toBe(false);
    expect(ok(withWeek({ tue: [["10:00"]] }))).toBe(false);
  });

  it("refuses a weekday that is not one", () => {
    expect(ok(withWeek({ funday: [] }))).toBe(false);
  });

  it("seasons are real month-days, at most 12", () => {
    expect(ok({ week: {}, seasons: [{ from: "02-29", to: "03-01", week: {} }] })).toBe(true);
    expect(ok({ week: {}, seasons: [{ from: "02-30", to: "03-01", week: {} }] })).toBe(false);
    expect(ok({ week: {}, seasons: [{ from: "13-01", to: "03-01", week: {} }] })).toBe(false);
    expect(ok({ week: {}, seasons: [{ from: "2026-11-01", to: "03-01", week: {} }] })).toBe(false);
    const many = Array.from({ length: 13 }, () => ({ from: "01-01", to: "01-02", week: {} }));
    expect(ok({ week: {}, seasons: many })).toBe(false);
  });

  it("closed dates are a real full date or a real month-day", () => {
    expect(ok({ week: {}, closed: ["2026-12-31", "12-31"] })).toBe(true);
    expect(ok({ week: {}, closed: ["2026-02-30"] })).toBe(false);
    expect(ok({ week: {}, closed: ["31-12"] })).toBe(false);
    expect(ok({ week: {}, closed: ["Christmas"] })).toBe(false);
  });

  it("the source must be a web address", () => {
    expect(ok({ week: {}, source: "javascript:alert(1)" })).toBe(false);
    expect(ok({ week: {}, source: "https://example.com" })).toBe(true);
  });

  it("refuses unknown top-level keys", () => {
    expect(ok({ week: {}, holidays: [] })).toBe(false);
  });
});

describe("parseOpeningHours / serializeOpeningHours", () => {
  it("round-trips", () => {
    const oh = openingHoursSchema.parse(VALID);
    expect(parseOpeningHours(serializeOpeningHours(oh))).toEqual(oh);
  });
  it("empty hours store as null", () => {
    expect(serializeOpeningHours({ week: {}, seasons: [], closed: [] })).toBeNull();
    expect(serializeOpeningHours(null)).toBeNull();
  });
  it("anything unreadable reads as not known", () => {
    expect(parseOpeningHours(null)).toBeNull();
    expect(parseOpeningHours("")).toBeNull();
    expect(parseOpeningHours("not json")).toBeNull();
    expect(parseOpeningHours(JSON.stringify({ week: { tue: [["18:00", "10:00"]] } }))).toBeNull();
    expect(parseOpeningHours(JSON.stringify({ week: {}, seasons: [], closed: [] }))).toBeNull();
  });
});
