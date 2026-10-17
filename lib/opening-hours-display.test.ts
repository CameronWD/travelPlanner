import { describe, expect, it } from "vitest";
import type { OpeningHours } from "@/lib/opening-hours";
import { formatSpans, openingHoursSummary, openingLine, weeklySummary } from "./opening-hours-display";

// 2027-06-01 is a Tuesday. Adapted from the D.1 brief to S's actual shape
// (d-as-built.md): `week` not `weekly`, `closed` not `closedDates`, and a
// closed weekday is `[]`, not `null` (every key is present here, matching
// the brief's fixture, but note an ABSENT key would mean "not known").
const HOURS: OpeningHours = {
  week: {
    mon: [["10:00", "18:00"]],
    tue: [],
    wed: [["10:00", "18:00"]],
    thu: [["10:00", "18:00"]],
    fri: [["10:00", "18:00"]],
    sat: [["09:00", "12:00"], ["14:00", "18:00"]],
    sun: [],
  },
  seasons: [],
  closed: ["2027-06-10"],
};

describe("openingLine", () => {
  it("names the day's spans, with 'today' only when the date is today", () => {
    expect(openingLine(HOURS, "2027-06-02")).toEqual({ text: "Open 10:00–18:00", closed: false });
    expect(openingLine(HOURS, "2027-06-02", { today: true })).toEqual({ text: "Open 10:00–18:00 today", closed: false });
    expect(openingLine(HOURS, "2027-06-05")).toEqual({ text: "Open 09:00–12:00, 14:00–18:00", closed: false });
  });

  it("says which weekday is shut, or that the date itself is", () => {
    expect(openingLine(HOURS, "2027-06-01")).toEqual({ text: "Closed on Tuesdays", closed: true });
    expect(openingLine(HOURS, "2027-06-10")).toEqual({ text: "Closed that day", closed: true });
    expect(openingLine(HOURS, "2027-06-01", { today: true })).toEqual({ text: "Closed today", closed: true });
  });

  it("is silent with no hours, or when the weekday is entered nowhere (not known)", () => {
    expect(openingLine(null, "2027-06-02")).toBeNull();
    expect(openingLine(undefined, "2027-06-02")).toBeNull();
    const sparse: OpeningHours = { week: { mon: [["10:00", "18:00"]] }, seasons: [], closed: [] };
    expect(openingLine(sparse, "2027-06-01")).toBeNull(); // Tuesday never entered
  });

  it("a closed date wins even on a day the week would otherwise open", () => {
    // 2027-06-10 is a Thursday, normally open; the closed date overrides it.
    expect(openingLine(HOURS, "2027-06-10")).toEqual({ text: "Closed that day", closed: true });
  });
});

describe("summaries", () => {
  it("formatSpans joins spans with an en dash and a comma", () => {
    expect(formatSpans([["09:00", "12:00"], ["14:00", "18:00"]])).toBe("09:00–12:00, 14:00–18:00");
  });

  it("weeklySummary groups runs of equal days, Monday first", () => {
    expect(weeklySummary(HOURS.week)).toBe(
      "Mon 10:00–18:00 · Tue closed · Wed–Fri 10:00–18:00 · Sat 09:00–12:00, 14:00–18:00 · Sun closed",
    );
    const same = [["10:00", "18:00"]] as [string, string][];
    expect(weeklySummary({ mon: same, tue: same, wed: same, thu: same, fri: same, sat: same, sun: same })).toBe(
      "Every day 10:00–18:00",
    );
  });

  it("weeklySummary says 'closed' or 'not set' for a whole week of one kind", () => {
    expect(weeklySummary({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] })).toBe("Closed every day");
    expect(weeklySummary({})).toBe("Hours not set");
  });

  it("weeklySummary groups the days never entered as 'not set'", () => {
    expect(weeklySummary({ mon: [["10:00", "18:00"]] })).toBe("Mon 10:00–18:00 · Tue–Sun not set");
  });

  it("openingHoursSummary counts seasons and closed dates", () => {
    expect(openingHoursSummary({ ...HOURS, seasons: [{ from: "11-01", to: "03-31", week: HOURS.week }] })).toBe(
      "Mon 10:00–18:00 · Tue closed · Wed–Fri 10:00–18:00 · Sat 09:00–12:00, 14:00–18:00 · Sun closed · 1 season · 1 closed date",
    );
  });

  // Fix round 1 (controller ruling): an empty week (nothing entered) must
  // not say "Hours not set" when there's a season or a closed date to lead
  // with instead — only a fully empty set says "Hours not set" alone.
  it("openingHoursSummary drops 'Hours not set' when seasons or closed dates exist", () => {
    expect(openingHoursSummary({ week: {}, seasons: [{ from: "11-01", to: "03-31", week: {} }], closed: [] })).toBe("1 season");
    expect(openingHoursSummary({ week: {}, seasons: [], closed: ["12-25"] })).toBe("1 closed date");
    expect(openingHoursSummary({
      week: {},
      seasons: [{ from: "11-01", to: "03-31", week: {} }, { from: "06-01", to: "08-31", week: {} }],
      closed: ["12-25"],
    })).toBe("2 seasons · 1 closed date");
    expect(openingHoursSummary({ week: {}, seasons: [], closed: [] })).toBe("Hours not set");
    // An explicitly all-closed week is a real fact, not "not set" — still said alongside seasons.
    expect(openingHoursSummary({
      week: { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] },
      seasons: [{ from: "11-01", to: "03-31", week: HOURS.week }],
      closed: [],
    })).toBe("Closed every day · 1 season");
  });
});
