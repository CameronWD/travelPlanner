import { describe, it, expect } from "vitest";
import { buildStopDays, groupScheduledItemsByStop, type StopDayItem } from "./stop-days";

const item = (over: Partial<StopDayItem>): StopDayItem => ({
  id: "i1", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-06",
  startTime: null, endTime: null, stopId: "s1", ...over,
});

describe("buildStopDays", () => {
  it("returns one StopDay per calendar day, arrive to depart inclusive", () => {
    const days = buildStopDays("2026-12-05", "2026-12-08", []);
    expect(days.map((d) => d.dateISO)).toEqual([
      "2026-12-05", "2026-12-06", "2026-12-07", "2026-12-08",
    ]);
    expect(days.every((d) => d.timed.length === 0 && d.untimed.length === 0)).toBe(true);
  });

  it("buckets items onto their date, splitting timed (sorted) from untimed", () => {
    const days = buildStopDays("2026-12-05", "2026-12-07", [
      item({ id: "a", title: "Seine cruise", date: "2026-12-06", startTime: "14:00" }),
      item({ id: "b", title: "Louvre", date: "2026-12-06", startTime: "09:30" }),
      item({ id: "c", title: "Wander Marais", date: "2026-12-06", startTime: null }),
    ]);
    const dec6 = days.find((d) => d.dateISO === "2026-12-06")!;
    expect(dec6.timed.map((i) => i.id)).toEqual(["b", "a"]);
    expect(dec6.untimed.map((i) => i.id)).toEqual(["c"]);
  });

  it("excludes items dated outside the stay (ADR 0038 un-slots those; defensive here)", () => {
    const days = buildStopDays("2026-12-05", "2026-12-07", [
      item({ id: "out", date: "2026-12-20" }),
      item({ id: "undated", date: null }),
    ]);
    expect(days.flatMap((d) => [...d.timed, ...d.untimed])).toEqual([]);
  });

  it("handles a same-day visit (arrive === depart) as a single day", () => {
    const days = buildStopDays("2026-12-05", "2026-12-05", [item({ id: "a", date: "2026-12-05" })]);
    expect(days).toHaveLength(1);
    expect(days[0].untimed.map((i) => i.id)).toEqual(["a"]);
  });

  it("preserves input order for items with the same startTime", () => {
    const days = buildStopDays("2026-12-05", "2026-12-07", [
      item({ id: "a", title: "First lunch", date: "2026-12-06", startTime: "12:00" }),
      item({ id: "b", title: "Second lunch", date: "2026-12-06", startTime: "12:00" }),
      item({ id: "c", title: "Third lunch", date: "2026-12-06", startTime: "12:00" }),
    ]);
    const dec6 = days.find((d) => d.dateISO === "2026-12-06")!;
    expect(dec6.timed.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

describe("groupScheduledItemsByStop", () => {
  const munich = { id: "munich", arriveDate: "2026-12-05", departDate: "2026-12-10" };
  const strasbourg = { id: "strasbourg", arriveDate: "2026-12-10", departDate: "2026-12-12" };

  it("puts a changeover-day item under BOTH stops regardless of which owns it", () => {
    const dinner = { id: "i1", title: "Dinner", category: "FOOD", date: "2026-12-10", stopId: "munich" };
    const grouped = groupScheduledItemsByStop([munich, strasbourg], [dinner]);
    expect(grouped.get("munich")).toEqual([dinner]);
    expect(grouped.get("strasbourg")).toEqual([dinner]);
  });

  it("leaves the item's own stopId untouched — grouping is display, not ownership", () => {
    const dinner = { id: "i1", title: "Dinner", category: "FOOD", date: "2026-12-10", stopId: "munich" };
    const grouped = groupScheduledItemsByStop([munich, strasbourg], [dinner]);
    expect(grouped.get("strasbourg")![0].stopId).toBe("munich");
  });

  it("shows a dated item with NO stop under whichever stop covers its date", () => {
    const placed = { id: "i2", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-07", stopId: null };
    const grouped = groupScheduledItemsByStop([munich, strasbourg], [placed]);
    expect(grouped.get("munich")).toEqual([placed]);
    expect(grouped.get("strasbourg")).toEqual([]);
  });

  it("ignores rough stops, which have no dates to cover a day with", () => {
    const rough = { id: "rough", arriveDate: null, departDate: null };
    const item = { id: "i3", title: "X", category: "OTHER", date: "2026-12-07", stopId: "rough" };
    const grouped = groupScheduledItemsByStop([rough], [item]);
    expect(grouped.get("rough")).toBeUndefined();
  });

  it("ignores undated items — they are things-to-do, not day rows", () => {
    const todo = { id: "i4", title: "Y", category: "OTHER", date: null, stopId: "munich" };
    const grouped = groupScheduledItemsByStop([munich], [todo]);
    expect(grouped.get("munich")).toEqual([]);
  });
});
