import { describe, it, expect } from "vitest";
import { buildStopDays, type StopDayItem } from "./stop-days";

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
