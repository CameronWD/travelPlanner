import { describe, expect, it } from "vitest";
import {
  hoursOn, isClosedDate, isEmptyOpeningHours, openingHoursFamilyRoot, openingHoursFamilyWhere,
  seasonCovers, seasonOn, type OpeningHours, type OpeningSeason, type WeekHours,
} from "./opening-hours";

// Usual week: Monday closed, Tue–Thu 10–18, Friday split (two spans), Saturday 9–18, Sunday not known.
const USUAL: WeekHours = {
  mon: [],
  tue: [["10:00", "18:00"]],
  wed: [["10:00", "18:00"]],
  thu: [["10:00", "18:00"]],
  fri: [["10:00", "13:00"], ["14:00", "20:00"]],
  sat: [["09:00", "18:00"]],
};
// Spans the year end; says nothing about Wednesdays (or Mon/Thu/Fri/Sun).
const WINTER: OpeningSeason = { label: "Winter", from: "11-01", to: "03-31", week: { tue: [["10:00", "16:00"]], sat: [] } };
const SUMMER: OpeningSeason = { label: "Summer", from: "06-01", to: "09-15", week: { tue: [["09:00", "19:00"]] } };
const AUGUST: OpeningSeason = { label: "August", from: "08-01", to: "08-31", week: { tue: [["09:00", "21:00"]], fri: [["09:00", "12:00"], ["17:00", "24:00"]] } };
const OH: OpeningHours = {
  week: USUAL,
  seasons: [SUMMER, WINTER, AUGUST],
  closed: ["12-25", "2027-01-12", "2026-08-05"],
};

describe("hoursOn — the usual week", () => {
  it("one span on an open weekday", () => {
    expect(hoursOn(OH, "2026-10-13")).toEqual({ closed: false, spans: [["10:00", "18:00"]], by: "week", seasonLabel: null }); // Tue
  });
  it("two spans", () => {
    expect(hoursOn(OH, "2026-10-16")).toEqual({ closed: false, spans: [["10:00", "13:00"], ["14:00", "20:00"]], by: "week", seasonLabel: null }); // Fri
  });
  it("a weekday entered as closed", () => {
    expect(hoursOn(OH, "2026-10-12")).toEqual({ closed: true, spans: [], by: "week", seasonLabel: null }); // Mon
  });
  it("a weekday nobody entered is not known (null), never closed", () => {
    expect(hoursOn(OH, "2026-10-18")).toBeNull(); // Sun
  });
  it("no opening hours at all is not known", () => {
    expect(hoursOn(null, "2026-10-13")).toBeNull();
    expect(hoursOn(undefined, "2026-10-13")).toBeNull();
  });
});

describe("hoursOn — seasons", () => {
  it("a season spanning the year end applies on both sides of it", () => {
    const winterTue = { closed: false, spans: [["10:00", "16:00"]], by: "season", seasonLabel: "Winter" };
    expect(hoursOn(OH, "2026-11-03")).toEqual(winterTue); // Tue, first week
    expect(hoursOn(OH, "2026-12-29")).toEqual(winterTue); // Tue, December
    expect(hoursOn(OH, "2027-01-05")).toEqual(winterTue); // Tue, January
    expect(hoursOn(OH, "2027-03-30")).toEqual(winterTue); // Tue, last week
    expect(hoursOn(OH, "2028-02-29")).toEqual(winterTue); // Tue, leap day
  });
  it("the season's bounds are inclusive and it ends where it says", () => {
    expect(hoursOn(OH, "2026-11-07")).toEqual({ closed: true, spans: [], by: "season", seasonLabel: "Winter" }); // Sat in season: closed
    expect(hoursOn(OH, "2026-10-31")).toEqual({ closed: false, spans: [["09:00", "18:00"]], by: "week", seasonLabel: null }); // Sat before it
    expect(hoursOn(OH, "2027-04-06")).toEqual({ closed: false, spans: [["10:00", "18:00"]], by: "week", seasonLabel: null }); // Tue after it
  });
  it("a weekday the season says nothing about falls back to the usual week", () => {
    expect(hoursOn(OH, "2027-03-31")).toEqual({ closed: false, spans: [["10:00", "18:00"]], by: "week", seasonLabel: null }); // Wed in Winter
  });
  it("the shortest covering season wins", () => {
    expect(hoursOn(OH, "2026-08-11")).toEqual({ closed: false, spans: [["09:00", "21:00"]], by: "season", seasonLabel: "August" }); // Tue: August ⊂ Summer
    expect(hoursOn(OH, "2026-09-15")).toEqual({ closed: false, spans: [["09:00", "19:00"]], by: "season", seasonLabel: "Summer" }); // Tue, Summer's last day
    expect(hoursOn(OH, "2026-09-16")).toEqual({ closed: false, spans: [["10:00", "18:00"]], by: "week", seasonLabel: null }); // Wed, after Summer
  });
  it("two spans inside a season, closing at midnight", () => {
    expect(hoursOn(OH, "2026-08-07")).toEqual({ closed: false, spans: [["09:00", "12:00"], ["17:00", "24:00"]], by: "season", seasonLabel: "August" }); // Fri
  });
  it("of two equally long seasons, the one listed first wins", () => {
    const a: OpeningSeason = { label: "A", from: "05-01", to: "05-10", week: { tue: [["08:00", "09:00"]] } };
    const b: OpeningSeason = { label: "B", from: "05-05", to: "05-14", week: { tue: [["20:00", "21:00"]] } };
    expect(hoursOn({ week: {}, seasons: [a, b], closed: [] }, "2026-05-05")?.seasonLabel).toBe("A"); // Tue
    expect(hoursOn({ week: {}, seasons: [b, a], closed: [] }, "2026-05-05")?.seasonLabel).toBe("B");
  });
  it("an unlabelled season reports a null label", () => {
    const s: OpeningSeason = { from: "01-01", to: "12-31", week: { tue: [] } };
    expect(hoursOn({ week: {}, seasons: [s], closed: [] }, "2026-10-13")).toEqual({ closed: true, spans: [], by: "season", seasonLabel: null });
  });
});

describe("hoursOn — closed dates", () => {
  it("a recurring MM-DD closes the day every year, over the usual week", () => {
    expect(hoursOn(OH, "2026-12-25")).toEqual({ closed: true, spans: [], by: "closed-date", seasonLabel: null }); // Fri
    expect(hoursOn(OH, "2027-12-25")).toEqual({ closed: true, spans: [], by: "closed-date", seasonLabel: null }); // Sat
  });
  it("a one-off closed date inside a season beats the season", () => {
    expect(hoursOn(OH, "2027-01-12")).toEqual({ closed: true, spans: [], by: "closed-date", seasonLabel: null }); // Tue in Winter
    expect(hoursOn(OH, "2026-08-05")).toEqual({ closed: true, spans: [], by: "closed-date", seasonLabel: null }); // Wed in August
  });
  it("a one-off closed date is that year only", () => {
    expect(hoursOn(OH, "2028-01-12")).not.toMatchObject({ by: "closed-date" });
  });
  it("closes even a day whose weekday nobody entered", () => {
    expect(hoursOn({ week: {}, seasons: [], closed: ["2026-10-18"] }, "2026-10-18")).toEqual({ closed: true, spans: [], by: "closed-date", seasonLabel: null });
  });
});

describe("seasonCovers / seasonOn / isClosedDate", () => {
  it("handles plain and year-end-spanning ranges", () => {
    expect(seasonCovers({ from: "06-01", to: "09-15" }, "06-01")).toBe(true);
    expect(seasonCovers({ from: "06-01", to: "09-15" }, "09-16")).toBe(false);
    expect(seasonCovers({ from: "11-01", to: "03-31" }, "12-31")).toBe(true);
    expect(seasonCovers({ from: "11-01", to: "03-31" }, "01-01")).toBe(true);
    expect(seasonCovers({ from: "11-01", to: "03-31" }, "04-01")).toBe(false);
    expect(seasonCovers({ from: "11-01", to: "03-31" }, "10-31")).toBe(false);
    expect(seasonCovers({ from: "07-04", to: "07-04" }, "07-04")).toBe(true);
  });
  it("seasonOn picks the governing season or none", () => {
    expect(seasonOn(OH, "2026-08-20")?.label).toBe("August");
    expect(seasonOn(OH, "2026-10-13")).toBeNull();
  });
  it("isClosedDate matches a full date or a recurring month-day", () => {
    expect(isClosedDate(OH, "2031-12-25")).toBe(true);
    expect(isClosedDate(OH, "2027-01-12")).toBe(true);
    expect(isClosedDate(OH, "2027-01-13")).toBe(false);
  });
});

describe("isEmptyOpeningHours", () => {
  it("is empty only with no weekday, season or closed date entered", () => {
    expect(isEmptyOpeningHours({ week: {}, seasons: [], closed: [] })).toBe(true);
    expect(isEmptyOpeningHours({ week: {}, seasons: [], closed: [], source: "https://example.com" })).toBe(true);
    expect(isEmptyOpeningHours({ week: { mon: [] }, seasons: [], closed: [] })).toBe(false);
    expect(isEmptyOpeningHours({ week: {}, seasons: [WINTER], closed: [] })).toBe(false);
    expect(isEmptyOpeningHours({ week: {}, seasons: [], closed: ["12-25"] })).toBe(false);
  });
});

describe("the opening-hours family (a thing to do and its placed copies share them)", () => {
  it("the root is the source idea for a placed copy, else the Item itself", () => {
    expect(openingHoursFamilyRoot({ id: "copy-1", sourceItemId: "idea-1" })).toBe("idea-1");
    expect(openingHoursFamilyRoot({ id: "idea-1", sourceItemId: null })).toBe("idea-1");
  });
  it("selects the root and every copy placed from it, in the Trip", () => {
    expect(openingHoursFamilyWhere("trip-1", "idea-1")).toEqual({ tripId: "trip-1", OR: [{ id: "idea-1" }, { sourceItemId: "idea-1" }] });
  });
});
