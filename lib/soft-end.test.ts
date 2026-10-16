import { describe, expect, it } from "vitest";
import { grownEndDate, softEndDate, type SoftEndLeg, type SoftEndStop } from "./soft-end";

const tokyo: SoftEndStop = { id: "tokyo", sortOrder: 1, arriveDate: "2026-12-05", departDate: "2026-12-11", timezone: "Asia/Tokyo" };
const osaka: SoftEndStop = { id: "osaka", sortOrder: 0, arriveDate: "2026-12-01", departDate: "2026-12-05", timezone: "Asia/Tokyo" };
const home = (over: Partial<SoftEndLeg>): SoftEndLeg => ({
  fromStopId: "tokyo", toStopId: null, depIsHome: false, arrIsHome: true, arrAt: null, ...over,
});

describe("softEndDate (F4: the later of the last scheduled depart and the return leg's landing)", () => {
  it("a one-way trip with no return leg ends on the last scheduled Stop's depart", () => {
    expect(softEndDate({ stops: [osaka, tokyo], transports: [], homeTimezone: "Australia/Brisbane" })).toBe("2026-12-11");
  });

  it("a return leg landing the next day in the Home base's zone moves the end to that day (spec scenario)", () => {
    // Departs Tokyo 11 Dec 22:00 JST, lands Brisbane 12 Dec 08:30 AEST = 2026-12-11T22:30Z (UTC still 11 Dec).
    const leg = home({ arrAt: new Date("2026-12-11T22:30:00Z") });
    expect(softEndDate({ stops: [osaka, tokyo], transports: [leg], homeTimezone: "Australia/Brisbane" })).toBe("2026-12-12");
  });

  it("overnight across the date line: the Home zone's date wins over UTC's", () => {
    // Lands Honolulu 11 Dec 22:00 HST = 2026-12-12T08:00Z; Tokyo/UTC would both say 12 Dec.
    const leg = home({ arrAt: "2026-12-12T08:00:00.000Z" });
    const lastStop = { ...tokyo, departDate: "2026-12-10" };
    expect(softEndDate({ stops: [osaka, lastStop], transports: [leg], homeTimezone: "Pacific/Honolulu" })).toBe("2026-12-11");
  });

  it("a return leg landing before the last Stop's depart leaves the Stop's depart", () => {
    const leg = home({ arrAt: new Date("2026-12-09T03:00:00Z") });
    expect(softEndDate({ stops: [osaka, tokyo], transports: [leg], homeTimezone: "Australia/Brisbane" })).toBe("2026-12-11");
  });

  it("a Home end with no Home zone is read in the departing Stop's zone (the leg card's rule)", () => {
    // 2026-12-11T16:00Z = 12 Dec 01:00 in Tokyo.
    const leg = home({ arrAt: new Date("2026-12-11T16:00:00Z") });
    expect(softEndDate({ stops: [osaka, tokyo], transports: [leg], homeTimezone: null })).toBe("2026-12-12");
  });

  it("a free-text return leg off the last Stop counts (findReturnLeg's shape), read in that Stop's zone", () => {
    const leg = home({ arrIsHome: false, arrAt: new Date("2026-12-11T16:00:00Z") });
    expect(softEndDate({ stops: [osaka, tokyo], transports: [leg], homeTimezone: "Australia/Brisbane" })).toBe("2026-12-12");
  });

  it("a multi-leg trip home ends when the last leg lands, even one not tied to the last Stop", () => {
    const train = home({ arrIsHome: false, arrAt: new Date("2026-12-11T10:00:00Z") }); // to "Narita"
    const flight = home({ fromStopId: null, arrAt: new Date("2026-12-11T22:30:00Z") }); // Narita → Home
    expect(softEndDate({ stops: [osaka, tokyo], transports: [train, flight], homeTimezone: "Australia/Brisbane" })).toBe("2026-12-12");
  });

  it("ignores legs to another Stop, legs off a middle Stop, and legs with no arrival", () => {
    const toStop = home({ arrIsHome: false, toStopId: "osaka", arrAt: new Date("2026-12-20T00:00:00Z") });
    const offMiddle = home({ arrIsHome: false, fromStopId: "osaka", arrAt: new Date("2026-12-20T00:00:00Z") });
    const undated = home({ arrAt: null });
    expect(softEndDate({ stops: [osaka, tokyo], transports: [toStop, offMiddle, undated], homeTimezone: "Australia/Brisbane" })).toBe("2026-12-11");
  });

  it("is null with no scheduled Stop and no dated return leg", () => {
    const rough: SoftEndStop = { id: "r", sortOrder: 0, arriveDate: null, departDate: null, timezone: null };
    expect(softEndDate({ stops: [rough], transports: [], homeTimezone: "Australia/Brisbane" })).toBeNull();
    expect(softEndDate({ stops: [], transports: [], homeTimezone: null })).toBeNull();
  });
});

describe("grownEndDate (never shrinks)", () => {
  it("grows from nothing or from an earlier end", () => {
    expect(grownEndDate(null, "2026-12-12")).toBe("2026-12-12");
    expect(grownEndDate("2026-12-11", "2026-12-12")).toBe("2026-12-12");
  });
  it("writes nothing for an equal or earlier candidate, or none", () => {
    expect(grownEndDate("2026-12-12", "2026-12-12")).toBeNull();
    expect(grownEndDate("2026-12-12", "2026-12-11")).toBeNull();
    expect(grownEndDate("2026-12-12", null)).toBeNull();
  });
});
