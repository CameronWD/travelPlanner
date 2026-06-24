import { describe, expect, it } from "vitest";
import {
  chapterForDate,
  chapterForStop,
  chaptersOverlap,
  groupStopsByChapter,
  isTransportBetweenLegs,
  chapterIdForTransport,
  suggestChapterRuns,
  type ChapterLike,
  type StopLike,
  type TransportLike,
} from "./chapters";

const FINLAND: ChapterLike = { id: "fi", name: "Finland", colour: "sky",    startDate: "2026-06-26", endDate: "2026-07-02" };
const LONDON: ChapterLike  = { id: "uk", name: "London",  colour: "amber",  startDate: "2026-07-03", endDate: "2026-07-07" };

const stops: StopLike[] = [
  { id: "s-hel", arriveDate: "2026-06-26", departDate: "2026-06-30", country: "Finland", sortOrder: 0 },
  { id: "s-rov", arriveDate: "2026-06-30", departDate: "2026-07-03", country: "Finland", sortOrder: 1 },
  { id: "s-lon", arriveDate: "2026-07-03", departDate: "2026-07-07", country: "United Kingdom", sortOrder: 2 },
  { id: "s-ung", arriveDate: "2026-07-08", departDate: "2026-07-10", country: null, sortOrder: 3 },
];

describe("chapterForDate / chapterForStop", () => {
  it("returns the covering chapter (inclusive bounds)", () => {
    expect(chapterForDate("2026-06-28", [FINLAND, LONDON])?.id).toBe("fi");
    expect(chapterForDate("2026-07-05", [FINLAND, LONDON])?.id).toBe("uk");
  });
  it("places a boundary-straddling stop by its arrive date", () => {
    // arrives 07-01 (Finland), departs 07-05 (London's range) -> placed by arrive date
    expect(chapterForStop({ id: "x", arriveDate: "2026-07-01", departDate: "2026-07-05", country: null, sortOrder: 9 }, [FINLAND, LONDON])?.id).toBe("fi");
  });
  it("returns null for a date in a gap", () => {
    expect(chapterForDate("2026-07-09", [FINLAND, LONDON])).toBeNull();
  });
});

describe("chaptersOverlap", () => {
  it("detects overlap on a shared boundary day", () => {
    expect(chaptersOverlap({ startDate: "2026-06-26", endDate: "2026-07-03" }, { startDate: "2026-07-03", endDate: "2026-07-07" })).toBe(true);
  });
  it("is false for a clean gap", () => {
    expect(chaptersOverlap(FINLAND, { startDate: "2026-07-04", endDate: "2026-07-07" })).toBe(false);
  });
});

describe("groupStopsByChapter", () => {
  it("groups consecutive stops by chapter, preserving order, with a null group for gaps", () => {
    const groups = groupStopsByChapter(stops, [FINLAND, LONDON]);
    expect(groups.map((g) => g.chapter?.id ?? null)).toEqual(["fi", "uk", null]);
    expect(groups[0].stops.map((s) => s.id)).toEqual(["s-hel", "s-rov"]);
    expect(groups[2].stops.map((s) => s.id)).toEqual(["s-ung"]);
  });
  it("returns a single null group when there are no chapters", () => {
    const groups = groupStopsByChapter(stops, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].chapter).toBeNull();
    expect(groups[0].stops).toHaveLength(4);
  });
});

describe("isTransportBetweenLegs / chapterIdForTransport", () => {
  const stopsById = Object.fromEntries(stops.map((s) => [s.id, s]));
  const chapters = [FINLAND, LONDON];
  it("intra-chapter transport (both ends same chapter) is NOT between-legs", () => {
    const t: TransportLike = { id: "t1", fromStopId: "s-hel", toStopId: "s-rov", depAt: null };
    expect(isTransportBetweenLegs(t, chapters, stopsById)).toBe(false);
    expect(chapterIdForTransport(t, chapters, stopsById)).toBe("fi");
  });
  it("crossing transport IS between-legs", () => {
    const t: TransportLike = { id: "t2", fromStopId: "s-rov", toStopId: "s-lon", depAt: null };
    expect(isTransportBetweenLegs(t, chapters, stopsById)).toBe(true);
    expect(chapterIdForTransport(t, chapters, stopsById)).toBeNull();
  });
  it("a home bookend (null endpoint) IS between-legs", () => {
    const t: TransportLike = { id: "t3", fromStopId: null, toStopId: "s-hel", depAt: null };
    expect(isTransportBetweenLegs(t, chapters, stopsById)).toBe(true);
  });
  it("transport touching an ungrouped stop IS between-legs", () => {
    const t: TransportLike = { id: "t4", fromStopId: "s-lon", toStopId: "s-ung", depAt: null };
    expect(isTransportBetweenLegs(t, chapters, stopsById)).toBe(true);
  });
});

describe("suggestChapterRuns", () => {
  it("proposes one run per consecutive same-country block, skipping country-less stops", () => {
    const runs = suggestChapterRuns(stops);
    // Finland's endDate is trimmed to the day before UK's startDate so the
    // bands are contiguous but non-overlapping.
    expect(runs).toEqual([
      { name: "Finland", startDate: "2026-06-26", endDate: "2026-07-02" },
      { name: "United Kingdom", startDate: "2026-07-03", endDate: "2026-07-07" },
    ]);
  });
  it("returns adjacent runs that do not overlap each other", () => {
    const runs = suggestChapterRuns(stops);
    for (let i = 0; i < runs.length - 1; i++) {
      expect(chaptersOverlap(runs[i], runs[i + 1])).toBe(false);
    }
  });
  it("splits a revisited country into separate runs", () => {
    const there: StopLike[] = [
      { id: "a", arriveDate: "2026-07-01", departDate: "2026-07-03", country: "France", sortOrder: 0 },
      { id: "b", arriveDate: "2026-07-03", departDate: "2026-07-06", country: "Italy", sortOrder: 1 },
      { id: "c", arriveDate: "2026-07-06", departDate: "2026-07-09", country: "France", sortOrder: 2 },
    ];
    expect(suggestChapterRuns(there).map((r) => r.name)).toEqual(["France", "Italy", "France"]);
  });
});

describe("mixed rough + dated membership", () => {
  const FR: ChapterLike = { id: "fr", name: "France", colour: "sky", startDate: "2026-07-03", endDate: "2026-07-09" };
  const ROUGH_IT: ChapterLike = { id: "it", name: "Italy", colour: "rose", startDate: null, endDate: null };

  it("groups a dated stop by its date band and a rough stop by its chapterId", () => {
    const mixed: StopLike[] = [
      { id: "paris", arriveDate: "2026-07-03", departDate: "2026-07-06", country: "France", sortOrder: 0 },
      { id: "rome", arriveDate: null, departDate: null, nights: 3, chapterId: "it", country: "Italy", sortOrder: 1 },
    ];
    const groups = groupStopsByChapter(mixed, [FR, ROUGH_IT]);
    expect(groups.map((g) => g.chapter?.id ?? null)).toEqual(["fr", "it"]);
    expect(groups[1].stops.map((s) => s.id)).toEqual(["rome"]);
  });

  it("a rough stop with no chapterId is ungrouped", () => {
    const s: StopLike = { id: "x", arriveDate: null, departDate: null, nights: 2, chapterId: null, country: null, sortOrder: 0 };
    expect(chapterForStop(s, [FR, ROUGH_IT])).toBeNull();
  });
});
