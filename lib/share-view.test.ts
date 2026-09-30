import { describe, expect, it } from "vitest";
import { scopeCaption, tonightsStay } from "./share-view";
import {
  shareStage, dayIndex, currentLeg, stopStatuses, nextStopAfter, shareTally,
  travellersLabel, polaroidTilt, isDoneAt, groupDaysByStop, shareSections,
} from "./share-view";

const scope = (over: Partial<Parameters<typeof scopeCaption>[0]> = {}) => ({
  includeAccommodation: true,
  includeTransport: true,
  includeDailyPlans: true,
  ...over,
});

describe("scopeCaption", () => {
  it("calls the all-on scope a full itinerary", () => {
    expect(scopeCaption(scope())).toBe("Full itinerary");
  });

  it("calls the all-off scope route & dates only", () => {
    expect(
      scopeCaption(
        scope({
          includeAccommodation: false,
          includeTransport: false,
          includeDailyPlans: false,
        }),
      ),
    ).toBe("Route & dates only");
  });

  it("lists the on dials in a fixed order for a partial scope", () => {
    expect(scopeCaption(scope({ includeTransport: false }))).toBe(
      "Route & dates · Accommodation · Daily plans",
    );
    expect(
      scopeCaption(
        scope({ includeAccommodation: false, includeDailyPlans: false }),
      ),
    ).toBe("Route & dates · Transport");
  });
});

describe("tonightsStay", () => {
  const stay = (checkIn: string, checkOut: string, name = "Hotel") => ({
    checkIn,
    checkOut,
    name,
  });

  it("returns the stay covering tonight", () => {
    const s = stay("2026-12-06", "2026-12-10");
    expect(tonightsStay([s], "2026-12-08")).toBe(s);
  });

  it("includes the check-in day and excludes the check-out day", () => {
    const s = stay("2026-12-06", "2026-12-10");
    expect(tonightsStay([s], "2026-12-06")).toBe(s);
    expect(tonightsStay([s], "2026-12-10")).toBeNull();
  });

  it("prefers the latest check-in when stays genuinely overlap", () => {
    const longStay = stay("2026-12-05", "2026-12-12", "Munich apartment");
    const newStay = stay("2026-12-10", "2026-12-14", "Strasbourg hotel");
    expect(tonightsStay([newStay, longStay], "2026-12-10")).toBe(newStay);
    expect(tonightsStay([newStay, longStay], "2026-12-11")).toBe(newStay);
  });

  it("returns null when nothing covers tonight", () => {
    expect(tonightsStay([stay("2026-12-06", "2026-12-10")], "2026-12-20")).toBeNull();
    expect(tonightsStay([], "2026-12-08")).toBeNull();
  });
});

describe("shareStage", () => {
  it("maps every Phase to a stage", () => {
    expect(shareStage("sketching")).toBe("before");
    expect(shareStage("planning")).toBe("before");
    expect(shareStage("final-prep")).toBe("before");
    expect(shareStage("travelling")).toBe("during");
    expect(shareStage("past")).toBe("after");
  });
});

describe("dayIndex", () => {
  it("counts days inclusively, like describePhase, and nights left to the end", () => {
    expect(dayIndex({ startDate: "2026-12-04", endDate: "2027-01-08", today: "2026-12-12" }))
      .toEqual({ day: 9, total: 36, fraction: 9 / 36, nightsLeft: 27 });
  });
  it("clamps to 1..total", () => {
    expect(dayIndex({ startDate: "2026-12-04", endDate: "2026-12-06", today: "2026-12-01" }).day).toBe(1);
    expect(dayIndex({ startDate: "2026-12-04", endDate: "2026-12-06", today: "2026-12-09" }).day).toBe(3);
  });
});

describe("currentLeg", () => {
  const legs = [
    { id: "a", depAt: "2026-12-15T09:05:00.000Z", arrAt: "2026-12-15T11:15:00.000Z" },
    { id: "b", depAt: null, arrAt: "2026-12-16T11:15:00.000Z" },
  ];
  it("finds the leg whose dep <= now < arr", () => {
    expect(currentLeg(legs, new Date("2026-12-15T10:00:00Z"))?.id).toBe("a");
  });
  it("is null at the arrival instant, before departure, and for a leg missing a time", () => {
    expect(currentLeg(legs, new Date("2026-12-15T11:15:00Z"))).toBeNull();
    expect(currentLeg(legs, new Date("2026-12-15T09:00:00Z"))).toBeNull();
    expect(currentLeg(legs, new Date("2026-12-16T10:00:00Z"))).toBeNull();
  });
  it("accepts Date instants", () => {
    const d = [{ depAt: new Date("2026-12-15T09:00:00Z"), arrAt: new Date("2026-12-15T12:00:00Z") }];
    expect(currentLeg(d, new Date("2026-12-15T10:00:00Z"))).toBe(d[0]);
  });
});

describe("stopStatuses", () => {
  const stops = [
    { id: "lon", arriveDate: "2026-12-05" },
    { id: "par", arriveDate: "2026-12-10" },
    { id: "rom", arriveDate: "2026-12-15" },
  ];
  it("marks the current stop, the ones before it past, the ones after future", () => {
    const m = stopStatuses(stops, "par", "2026-12-12");
    expect([...m.values()]).toEqual(["past", "current", "future"]);
  });
  it("on a changeover day the arriving stop is current and the departing one past", () => {
    const m = stopStatuses(stops, "par", "2026-12-10");
    expect(m.get("lon")).toBe("past");
    expect(m.get("par")).toBe("current");
  });
  it("before the trip everything is future; after it everything is past", () => {
    expect([...stopStatuses(stops, null, "2026-11-01").values()]).toEqual(["future", "future", "future"]);
    expect([...stopStatuses(stops, null, "2027-02-01").values()]).toEqual(["past", "past", "past"]);
  });
});

describe("nextStopAfter", () => {
  const s = [{ id: "a" }, { id: "b" }];
  it("returns the following stop, or null at the end / without an id", () => {
    expect(nextStopAfter(s, "a")).toEqual({ id: "b" });
    expect(nextStopAfter(s, "b")).toBeNull();
    expect(nextStopAfter(s, null)).toBeNull();
  });
});

describe("shareTally", () => {
  it("counts nights, stops and distinct countries (nulls ignored)", () => {
    expect(shareTally([{ country: "France" }, { country: "France" }, { country: "Italy" }, { country: null }], 35))
      .toEqual({ nights: 35, stops: 4, countries: 2 });
  });
});

describe("travellersLabel", () => {
  it("reads naturally for 1, 2 and many", () => {
    expect(travellersLabel([])).toBe("");
    expect(travellersLabel(["Cameron"], { possessive: true })).toBe("Cameron's trip");
    expect(travellersLabel(["Cameron", "Sam"], { possessive: true })).toBe("Cameron & Sam's trip");
    expect(travellersLabel(["Cameron", "Sam"])).toBe("Cameron & Sam");
    expect(travellersLabel(["A", "B", "C"], { possessive: true })).toBe("A, B & 1 other");
    expect(travellersLabel(["A", "B", "C", "D"])).toBe("A, B & 2 others");
  });
});

describe("polaroidTilt", () => {
  it("is stable for an id and always within ±2°", () => {
    expect(polaroidTilt("2026-12-05:u1")).toBe(polaroidTilt("2026-12-05:u1"));
    for (const id of ["a", "b", "c", "2026-12-05:u1", "x".repeat(40)]) {
      const t = polaroidTilt(id);
      expect(Math.abs(t)).toBeLessThanOrEqual(2);
      expect(t).not.toBe(0);
    }
  });
});

describe("isDoneAt", () => {
  it("uses the end time, else start + 1h; untimed is never done", () => {
    expect(isDoneAt("08:40", "09:10", "09:10")).toBe(true);
    expect(isDoneAt("08:40", "09:10", "09:09")).toBe(false);
    expect(isDoneAt("13:30", null, "14:29")).toBe(false);
    expect(isDoneAt("13:30", null, "14:30")).toBe(true);
    expect(isDoneAt("23:30", null, "23:59")).toBe(true);
    expect(isDoneAt(null, null, "23:59")).toBe(false);
  });
});

describe("groupDaysByStop", () => {
  it("groups by the day's stop, a gap day joining the stop before it", () => {
    const days = [
      { d: 1, stop: { id: "a" } },
      { d: 2, stop: null },
      { d: 3, stop: { id: "b" } },
    ];
    const g = groupDaysByStop(days, ["a", "b"]);
    expect(g.get("a")!.map((x) => x.d)).toEqual([1, 2]);
    expect(g.get("b")!.map((x) => x.d)).toEqual([3]);
  });
  it("a leading gap day joins the first stop; an unknown stop id is dropped", () => {
    const g = groupDaysByStop([{ stop: null }, { stop: { id: "zz" } }], ["a"]);
    expect(g.get("a")).toHaveLength(1);
  });
});

describe("shareSections (SHARE.md §1 order)", () => {
  const all = { journal: true, days: true, next: true, map: true };
  it("before", () => {
    expect(shareSections("before", all)).toEqual(["hero", "map", "route", "days", "cta"]);
  });
  it("during", () => {
    expect(shareSections("during", all)).toEqual(["hero", "right-now", "next", "journal", "map", "route", "days", "cta"]);
  });
  it("after", () => {
    expect(shareSections("after", all)).toEqual(["hero", "tally", "journal", "route", "map", "days", "cta"]);
  });
  it("skips what the link or the data hides", () => {
    expect(shareSections("during", { journal: false, days: false, next: false, map: false }))
      .toEqual(["hero", "right-now", "route", "cta"]);
  });
});
