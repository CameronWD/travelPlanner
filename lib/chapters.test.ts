import { describe, expect, it } from "vitest";
import {
  chapterForDate,
  chapterForStop,
  chaptersOverlap,
  groupStopsByChapter,
  isTransportBetweenLegs,
  chapterIdForTransport,
  sortedByStart,
  sortGroupStops,
  spanContributors,
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


describe("sortedByStart rough-chapter ordering", () => {
  // sortedByStart is exported for testing; see lib/chapters.ts.
  // Three-chapter case: one dated + two rough (sortOrder 2 and 0) — expect [dated, rough(sortOrder0), rough(sortOrder2)].
  const DATED: ChapterLike   = { id: "dated",   name: "Dated",   colour: "sky",  startDate: "2026-07-01", endDate: "2026-07-05", sortOrder: 1 };
  const ROUGH_A: ChapterLike = { id: "rough-a", name: "RoughA", colour: "rose", startDate: null, endDate: null, sortOrder: 0 };
  const ROUGH_B: ChapterLike = { id: "rough-b", name: "RoughB", colour: "blue", startDate: null, endDate: null, sortOrder: 2 };

  it("places dated chapters before rough, and rough chapters ordered by sortOrder ascending", () => {
    // Input order is deliberately scrambled (rough-b first, then rough-a, then dated).
    const sorted = sortedByStart([ROUGH_B, ROUGH_A, DATED]);
    expect(sorted.map((c) => c.id)).toEqual(["dated", "rough-a", "rough-b"]);
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

describe("sortGroupStops", () => {
  it("orders a group: dated by date, then rough by sortOrder", () => {
    const stops = [
      { id: "r2", arriveDate: null, departDate: null, sortOrder: 5 },
      { id: "d2", arriveDate: "2026-07-10", departDate: "2026-07-12", sortOrder: 1 },
      { id: "r1", arriveDate: null, departDate: null, sortOrder: 2 },
      { id: "d1", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 9 },
    ];
    expect(sortGroupStops(stops).map((s) => s.id)).toEqual(["d1", "d2", "r1", "r2"]);
  });
});

// ---------------------------------------------------------------------------
// spanContributors
// ---------------------------------------------------------------------------

const ch = (id: string, startDate: string | null, endDate: string | null): ChapterLike =>
  ({ id, name: id, colour: "#000", startDate, endDate });

const stop = (id: string, arriveDate: string | null, departDate: string | null, chapterId: string | null, sortOrder = 0): StopLike =>
  ({ id, arriveDate, departDate, chapterId, sortOrder });

describe("spanContributors", () => {
  const italy = ch("italy", "2026-07-03", "2026-07-06");
  const alps = ch("alps", "2026-07-20", "2026-07-25");
  const chapters = [italy, alps];

  it("includes a dated stop explicitly linked by chapterId", () => {
    const rome = stop("rome", "2026-07-03", "2026-07-06", "italy");
    expect(spanContributors(italy, [rome], chapters).map((s) => s.id)).toEqual(["rome"]);
  });

  it("includes a directly-dated stop (no chapterId) that falls in the band", () => {
    const verona = stop("verona", "2026-07-04", "2026-07-08", null);
    expect(spanContributors(italy, [verona], chapters).map((s) => s.id)).toEqual(["verona"]);
  });

  it("does not double-count: a chapterId'd stop only contributes to its own chapter", () => {
    // chapterId=alps but date sits inside italy's band → contributes to alps only, never italy.
    const odd = stop("odd", "2026-07-04", "2026-07-05", "alps");
    expect(spanContributors(italy, [odd], chapters)).toEqual([]);
    expect(spanContributors(alps, [odd], chapters).map((s) => s.id)).toEqual(["odd"]);
  });

  it("ignores rough (undated) stops — they don't define a span", () => {
    const rough = stop("x", null, null, "italy");
    expect(spanContributors(italy, [rough], chapters)).toEqual([]);
  });
});
