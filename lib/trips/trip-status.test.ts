import { describe, it, expect } from "vitest";
import {
  orderForCarousel, cardKind, cardLabel, cardBigNumber, cardDateLine, tripsMetaLine,
  cardAccessibleName, countUpcomingAndDone,
} from "./trip-status";

const TODAY = "2026-09-28";
const trip = (id: string, startDate: string | null, endDate: string | null, created = "2026-01-01", stopCount = 3) => ({
  id, name: id, startDate, endDate, createdAt: new Date(created), stopCount,
});

describe("orderForCarousel", () => {
  it("puts the nearest upcoming first, then other upcoming, ideas by creation, then done most recent first", () => {
    const trips = [
      trip("done-old", "2024-03-01", "2024-03-10", "2024-01-01"),
      trip("idea-new", null, null, "2026-05-01"),
      trip("far", "2027-04-23", "2027-05-03"),
      trip("done-new", "2025-03-01", "2025-03-10", "2023-01-01"),
      trip("near", "2026-12-04", "2027-01-08"),
      trip("idea-old", null, null, "2026-02-01"),
    ];
    expect(orderForCarousel(trips, TODAY).map((t) => t.id)).toEqual([
      "near", "far", "idea-new", "idea-old", "done-new", "done-old",
    ]);
  });
  it("puts a travelling trip ahead of everything", () => {
    const trips = [trip("near", "2026-12-04", "2027-01-08"), trip("now", "2026-09-20", "2026-10-05")];
    expect(orderForCarousel(trips, TODAY)[0].id).toBe("now");
  });
});

describe("cardKind / cardLabel", () => {
  it("names the first card up-next or on-the-road, the rest by phase", () => {
    expect(cardKind("planning", true)).toBe("up-next");
    expect(cardKind("final-prep", true)).toBe("up-next");
    expect(cardKind("travelling", true)).toBe("on-the-road");
    expect(cardKind("planning", false)).toBe("planning");
    expect(cardKind("final-prep", false)).toBe("planning");
    expect(cardKind("sketching", false)).toBe("idea");
    expect(cardKind("sketching", true)).toBe("idea");
    expect(cardKind("past", false)).toBe("done");
    expect(cardKind("past", true)).toBe("done");
  });
  it("labels", () => {
    expect(cardLabel("up-next")).toBe("UP NEXT");
    expect(cardLabel("on-the-road")).toBe("ON THE ROAD");
    expect(cardLabel("idea")).toBe("IDEA");
  });
});

describe("cardBigNumber", () => {
  it("sleeps to go for upcoming", () => {
    expect(cardBigNumber({ kind: "up-next", startDate: "2026-12-04", endDate: "2027-01-08", today: TODAY }))
      .toEqual({ value: "67", unit: ["sleeps", "to go"] });
    expect(cardBigNumber({ kind: "planning", startDate: "2026-09-29", endDate: null, today: TODAY }))
      .toEqual({ value: "1", unit: ["sleep", "to go"] });
  });
  it("Today on the departure day", () => {
    expect(cardBigNumber({ kind: "up-next", startDate: TODAY, endDate: "2026-10-02", today: TODAY }))
      .toEqual({ value: "Today", unit: null });
  });
  it("day n of m while on the road", () => {
    expect(cardBigNumber({ kind: "on-the-road", startDate: "2026-09-23", endDate: "2026-10-27", today: TODAY }))
      .toEqual({ value: "6", unit: ["of 35", "days"] });
  });
  it("year or ? for an idea", () => {
    expect(cardBigNumber({ kind: "idea", startDate: null, endDate: null, today: TODAY })).toEqual({ value: "?", unit: ["dates", "not set"] });
  });
  it("nights away for done", () => {
    expect(cardBigNumber({ kind: "done", startDate: "2025-03-01", endDate: "2025-03-10", today: TODAY }))
      .toEqual({ value: "9", unit: ["nights", "away"] });
  });
});

describe("cardBigNumber — rough month", () => {
  it("an Idea with a rough month shows Sometime in + the month", () => {
    expect(cardBigNumber({ kind: "idea", startDate: null, endDate: null, today: "2026-09-30", roughMonth: "2027-04" }))
      .toEqual({ value: "April", unit: null, lead: "Sometime in" });
  });
  it("names it for screen readers", () => {
    expect(cardAccessibleName("Japan", "idea", { value: "April", unit: null, lead: "Sometime in" })).toBe("Japan, idea, Sometime in April");
  });
});

describe("cardDateLine", () => {
  it("formats each kind", () => {
    expect(cardDateLine({ kind: "up-next", startDate: "2026-12-04", endDate: "2027-01-08", stopCount: 11, today: TODAY })).toBe("4 Dec – 8 Jan · 11 stops");
    expect(cardDateLine({ kind: "on-the-road", startDate: "2026-09-23", endDate: "2026-10-27", stopCount: 11, today: TODAY, currentStop: "Paris" })).toBe("Day 6 of 35 · Paris");
    expect(cardDateLine({ kind: "on-the-road", startDate: "2026-09-23", endDate: "2026-10-27", stopCount: 11, today: TODAY })).toBe("Day 6 of 35");
    expect(cardDateLine({ kind: "planning", startDate: "2027-04-23", endDate: "2027-05-03", stopCount: 4, today: TODAY })).toBe("23 Apr – 3 May");
    expect(cardDateLine({ kind: "idea", startDate: null, endDate: null, stopCount: 0, today: TODAY })).toBe("Add dates");
    expect(cardDateLine({ kind: "done", startDate: "2025-03-01", endDate: "2025-03-10", stopCount: 4, today: TODAY })).toBe("Mar 2025 · 4 stops");
    expect(cardDateLine({ kind: "done", startDate: "2025-03-01", endDate: "2025-03-10", stopCount: 1, today: TODAY })).toBe("Mar 2025 · 1 stop");
  });
  it("on-the-road on departure day renders Day 1 of m, not Today", () => {
    expect(cardDateLine({ kind: "on-the-road", startDate: TODAY, endDate: "2026-10-27", stopCount: 3, today: TODAY, currentStop: "Sydney" })).toBe("Day 1 of 30 · Sydney");
    expect(cardBigNumber({ kind: "on-the-road", startDate: TODAY, endDate: "2026-10-27", today: TODAY })).toEqual({ value: "Today", unit: null });
  });
});

describe("tripsMetaLine / countUpcomingAndDone", () => {
  it("drops zero parts", () => {
    expect(tripsMetaLine({ upcoming: 3, done: 1 })).toBe("3 coming up · 1 done");
    expect(tripsMetaLine({ upcoming: 2, done: 0 })).toBe("2 coming up");
    expect(tripsMetaLine({ upcoming: 0, done: 2 })).toBe("2 done");
    expect(tripsMetaLine({ upcoming: 0, done: 0 })).toBe("Nothing planned yet");
  });
  it("counts ideas and travelling as coming up", () => {
    expect(countUpcomingAndDone([trip("a", null, null), trip("b", "2026-09-20", "2026-10-05"), trip("c", "2024-01-01", "2024-01-05")], TODAY))
      .toEqual({ upcoming: 2, done: 1 });
  });
});

describe("cardAccessibleName", () => {
  it("joins name, status and countdown", () => {
    expect(cardAccessibleName("Christmas in Europe 2026", "up-next", { value: "67", unit: ["sleeps", "to go"] }))
      .toBe("Christmas in Europe 2026, up next, 67 sleeps to go");
    expect(cardAccessibleName("Japan", "idea", { value: "?", unit: ["dates", "not set"] })).toBe("Japan, idea, dates not set");
    expect(cardAccessibleName("NZ", "up-next", { value: "Today", unit: null })).toBe("NZ, up next, Today");
  });
});
