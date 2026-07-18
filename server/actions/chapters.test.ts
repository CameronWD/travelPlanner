import { afterEach, describe, expect, it, vi } from "vitest";

const {
  requireTripAccessMock, revalidatePathMock,
  chapterFindUniqueMock, chapterFindManyMock, chapterCountMock, chapterCreateMock, chapterCreateManyMock, chapterUpdateMock, chapterDeleteMock,
  stopFindManyMock, stopFindUniqueMock, stopUpdateMock, tripFindUniqueMock, queryRawMock, dbTransactionMock,
} = vi.hoisted(() => {
  const queryRawMock = vi.fn();
  const stopFindManyMock = vi.fn().mockResolvedValue([]);
  const stopUpdateMock = vi.fn();
  const chapterFindManyMock = vi.fn().mockResolvedValue([]);
  const chapterUpdateMock = vi.fn().mockResolvedValue({ id: "c1", name: "Italy", colour: "rose" });
  const tripFindUniqueMock = vi.fn();
  const dbTransactionMock = vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)({
        $queryRaw: queryRawMock,
        stop: { findMany: stopFindManyMock, update: stopUpdateMock },
        chapter: { findMany: chapterFindManyMock, update: chapterUpdateMock },
      });
    }
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg;
  });
  return {
    requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } }),
    revalidatePathMock: vi.fn(),
    chapterFindUniqueMock: vi.fn(),
    chapterFindManyMock,
    chapterCountMock: vi.fn().mockResolvedValue(0),
    chapterCreateMock: vi.fn().mockResolvedValue({ id: "c1", name: "Italy", colour: "rose" }),
    chapterCreateManyMock: vi.fn().mockResolvedValue({ count: 0 }),
    chapterUpdateMock,
    chapterDeleteMock: vi.fn().mockResolvedValue({ id: "c1" }),
    stopFindManyMock,
    stopFindUniqueMock: vi.fn(),
    stopUpdateMock,
    tripFindUniqueMock,
    queryRawMock,
    dbTransactionMock,
  };
});

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/db", () => ({
  db: {
    chapter: { findUnique: chapterFindUniqueMock, findMany: chapterFindManyMock, count: chapterCountMock, create: chapterCreateMock, createMany: chapterCreateManyMock, update: chapterUpdateMock, delete: chapterDeleteMock },
    stop: { findMany: stopFindManyMock, findUnique: stopFindUniqueMock, update: stopUpdateMock },
    trip: { findUnique: tripFindUniqueMock },
    $transaction: dbTransactionMock,
  },
}));
vi.mock("@/server/actions/activity", () => ({ recordActivity: vi.fn().mockResolvedValue(undefined) }));

import { createChapter, updateChapter, deleteChapter, suggestChaptersFromCountries, reorderChapters } from "./chapters";
import { recordActivity } from "@/server/actions/activity";
import type { ChapterInput } from "@/lib/validations/chapter";

const VALID: ChapterInput = { name: "Italy", colour: "rose", startDate: "2026-07-10", endDate: "2026-07-18" };

afterEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } });
  chapterFindManyMock.mockResolvedValue([]);
  chapterCountMock.mockResolvedValue(0);
  chapterCreateMock.mockResolvedValue({ id: "c1", name: "Italy", colour: "rose" });
  chapterUpdateMock.mockResolvedValue({ id: "c1", name: "Italy", colour: "rose" });
  stopFindManyMock.mockResolvedValue([]);
  stopUpdateMock.mockReset();
  // Restore dbTransactionMock to the callback-aware default.
  dbTransactionMock.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)({
        $queryRaw: queryRawMock,
        stop: { findMany: stopFindManyMock, update: stopUpdateMock },
        chapter: { findMany: chapterFindManyMock, update: chapterUpdateMock },
      });
    }
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg;
  });
});

describe("plan-scope: createChapter overlap + sortOrder", () => {
  it("firstOverlap fetches chapters within the real plan only (forkId null)", async () => {
    chapterFindManyMock.mockResolvedValue([]);
    chapterCreateMock.mockResolvedValue({ id: "c1", name: "Italy", colour: "rose" });

    await createChapter("trip-1", VALID);

    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", forkId: null }),
      }),
    );
  });

  it("nextSortOrder counts chapters within the real plan only (forkId null)", async () => {
    chapterFindManyMock.mockResolvedValue([]);
    chapterCreateMock.mockResolvedValue({ id: "c1", name: "Italy", colour: "rose" });

    await createChapter("trip-1", VALID);

    expect(chapterCountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", forkId: null }),
      }),
    );
  });
});

describe("plan-scope: createChapter with forkId", () => {
  it("creates a chapter in the given fork with fork-scoped overlap + sortOrder", async () => {
    chapterFindManyMock.mockResolvedValue([]);
    chapterCountMock.mockResolvedValue(1);
    chapterCreateMock.mockResolvedValue({ id: "c9", name: "Italy", colour: "rose" });

    await createChapter("trip-1", VALID, undefined, "fork-9");

    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }),
    );
    expect(chapterCountMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }),
    );
    expect(chapterCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ forkId: "fork-9", sortOrder: 1 }),
    });
  });

  it("writes forkId: null on create when no forkId is passed (real plan)", async () => {
    chapterFindManyMock.mockResolvedValue([]);
    chapterCountMock.mockResolvedValue(0);
    chapterCreateMock.mockResolvedValue({ id: "c1", name: "Italy", colour: "rose" });

    await createChapter("trip-1", VALID);

    expect(chapterCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ forkId: null }),
    });
  });
});

describe("plan-scope: suggestChaptersFromCountries", () => {
  it("fetches stops within the real plan only (forkId null)", async () => {
    stopFindManyMock.mockResolvedValue([]);
    chapterFindManyMock.mockResolvedValue([]);

    await suggestChaptersFromCountries("trip-1");

    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", forkId: null }),
      }),
    );
  });

  it("fetches existing chapters within the real plan only (forkId null)", async () => {
    stopFindManyMock.mockResolvedValue([]);
    chapterFindManyMock.mockResolvedValue([]);

    await suggestChaptersFromCountries("trip-1");

    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", forkId: null }),
      }),
    );
  });
});

describe("createChapter", () => {
  it("creates a chapter with sortOrder by start date when none overlap", async () => {
    chapterFindManyMock.mockResolvedValue([]);
    const r = await createChapter("trip-1", VALID);
    expect(r.success).toBe(true);
    expect(chapterCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: "trip-1", name: "Italy", colour: "rose" }) });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
  });
  it("rejects a chapter that overlaps an existing one", async () => {
    chapterFindManyMock.mockResolvedValue([{ id: "x", startDate: "2026-07-15", endDate: "2026-07-20" }]);
    const r = await createChapter("trip-1", VALID);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.startDate?.[0]).toMatch(/overlap/i);
    expect(chapterCreateMock).not.toHaveBeenCalled();
  });
  it("rejects invalid input", async () => {
    const r = await createChapter("trip-1", { ...VALID, name: "" });
    expect(r.success).toBe(false);
  });
  it("creates a rough chapter (no dates) and skips the overlap check", async () => {
    chapterFindManyMock.mockResolvedValue([]);
    chapterCreateMock.mockResolvedValue({ id: "c2", name: "Italy", colour: "rose" });
    const r = await createChapter("trip-1", { name: "Italy", colour: "rose" });
    expect(r.success).toBe(true);
    expect(chapterCreateMock).toHaveBeenCalledOnce();
    const callData = chapterCreateMock.mock.calls[0][0].data;
    expect(callData.name).toBe("Italy");
    expect(callData.colour).toBe("rose");
    // rough chapter — no concrete dates written to DB
    expect(callData.startDate == null || callData.startDate === undefined).toBe(true);
    expect(callData.endDate == null || callData.endDate === undefined).toBe(true);
  });
  it("records CREATED activity after a successful create", async () => {
    chapterFindManyMock.mockResolvedValue([]);
    chapterCreateMock.mockResolvedValue({ id: "c1", name: "Italy", colour: "rose" });
    await createChapter("trip-1", VALID);
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ tripId: "trip-1", verb: "CREATED", entityType: "CHAPTER", entityId: "c1" }));
  });
  it("does not record activity when create is rejected (overlap)", async () => {
    chapterFindManyMock.mockResolvedValue([{ id: "x", startDate: "2026-07-15", endDate: "2026-07-20" }]);
    await createChapter("trip-1", VALID);
    expect(recordActivity).not.toHaveBeenCalled();
  });
});

describe("updateChapter", () => {
  it("excludes itself from the overlap check", async () => {
    chapterFindUniqueMock
      .mockResolvedValueOnce({ id: "c1", tripId: "trip-1" }) // requireChapterAccess
      .mockResolvedValueOnce({ id: "c1", tripId: "trip-1", name: "Old Name", colour: "rose", startDate: "2026-07-01", endDate: "2026-07-05" }); // loadFullChapter
    chapterFindManyMock.mockResolvedValue([{ id: "c1", startDate: "2026-07-01", endDate: "2026-07-05" }]);
    const r = await updateChapter("c1", VALID);
    expect(r.success).toBe(true);
    expect(chapterUpdateMock).toHaveBeenCalled();
  });
  it("rejects when a different chapter overlaps", async () => {
    chapterFindUniqueMock.mockResolvedValue({ id: "c1", tripId: "trip-1" });
    chapterFindManyMock.mockResolvedValue([{ id: "other", startDate: "2026-07-15", endDate: "2026-07-20" }]);
    const r = await updateChapter("c1", VALID);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.startDate?.[0]).toMatch(/overlap/i);
    expect(chapterUpdateMock).not.toHaveBeenCalled();
  });
  it("rejects invalid input", async () => {
    chapterFindUniqueMock.mockResolvedValue({ id: "c1", tripId: "trip-1" });
    const r = await updateChapter("c1", { ...VALID, name: "" });
    expect(r.success).toBe(false);
    expect(chapterUpdateMock).not.toHaveBeenCalled();
  });
  it("records UPDATED activity with describeChanges after a successful update", async () => {
    chapterFindUniqueMock
      .mockResolvedValueOnce({ id: "c1", tripId: "trip-1" }) // requireChapterAccess
      .mockResolvedValueOnce({ id: "c1", tripId: "trip-1", name: "Old Name", colour: "rose", startDate: "2026-07-01", endDate: "2026-07-05" }); // loadFullChapter
    chapterFindManyMock.mockResolvedValue([]);
    chapterUpdateMock.mockResolvedValue({ id: "c1", name: "Italy", colour: "rose", startDate: "2026-07-10", endDate: "2026-07-18" });
    await updateChapter("c1", VALID);
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ tripId: "trip-1", verb: "UPDATED", entityType: "CHAPTER", entityId: "c1" }));
  });
  it("does not record activity when update is rejected (overlap)", async () => {
    chapterFindUniqueMock.mockResolvedValue({ id: "c1", tripId: "trip-1" });
    chapterFindManyMock.mockResolvedValue([{ id: "other", startDate: "2026-07-15", endDate: "2026-07-20" }]);
    await updateChapter("c1", VALID);
    expect(recordActivity).not.toHaveBeenCalled();
  });
});

describe("deleteChapter", () => {
  it("deletes and revalidates", async () => {
    chapterFindUniqueMock
      .mockResolvedValueOnce({ id: "c1", tripId: "trip-1" }) // requireChapterAccess
      .mockResolvedValueOnce({ name: "Italy" }); // findUnique for label
    const r = await deleteChapter("c1");
    expect(r.success).toBe(true);
    expect(chapterDeleteMock).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
  it("records DELETED activity with the chapter name as label", async () => {
    chapterFindUniqueMock
      .mockResolvedValueOnce({ id: "c1", tripId: "trip-1" }) // requireChapterAccess
      .mockResolvedValueOnce({ name: "Italy" }); // findUnique for label
    await deleteChapter("c1");
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ tripId: "trip-1", verb: "DELETED", entityType: "CHAPTER", entityId: "c1", entityLabel: "Italy" }));
  });
});

describe("suggestChaptersFromCountries", () => {
  it("creates one chapter per country run, skipping runs that overlap existing chapters", async () => {
    stopFindManyMock.mockResolvedValue([
      { id: "a", name: "City", arriveDate: "2026-06-26", departDate: "2026-06-30", countryCode: "fi", sortOrder: 0 },
      { id: "b", name: "City", arriveDate: "2026-06-30", departDate: "2026-07-03", countryCode: "fi", sortOrder: 1 },
      { id: "c", name: "City", arriveDate: "2026-07-10", departDate: "2026-07-18", countryCode: "it", sortOrder: 2 },
    ]);
    chapterFindManyMock.mockResolvedValue([{ id: "ex", startDate: "2026-07-09", endDate: "2026-07-20" }]);
    const r = await suggestChaptersFromCountries("trip-1");
    expect(r.success).toBe(true);
    if (r.success) expect(r.created).toBe(1);
    expect(chapterCreateManyMock).toHaveBeenCalledWith({ data: [expect.objectContaining({ name: "Finland", tripId: "trip-1" })] });
  });

  it("creates chapters for BOTH countries in a back-to-back trip sharing a boundary day", async () => {
    // Finland departs 2026-07-03; UK arrives 2026-07-03 — the shared boundary day
    // used to cause chaptersOverlap to fire and skip UK. After the fix, the runs
    // are trimmed so Finland ends 2026-07-02 and both chapters are created.
    stopFindManyMock.mockResolvedValue([
      { id: "a", name: "City", arriveDate: "2026-06-26", departDate: "2026-06-30", countryCode: "fi", sortOrder: 0 },
      { id: "b", name: "City", arriveDate: "2026-06-30", departDate: "2026-07-03", countryCode: "fi", sortOrder: 1 },
      { id: "c", name: "City", arriveDate: "2026-07-03", departDate: "2026-07-07", countryCode: "gb", sortOrder: 2 },
    ]);
    chapterFindManyMock.mockResolvedValue([]);
    const r = await suggestChaptersFromCountries("trip-1");
    expect(r.success).toBe(true);
    if (r.success) expect(r.created).toBe(2);
    const callArg = chapterCreateManyMock.mock.calls[0][0] as { data: { name: string }[] };
    expect(callArg.data).toHaveLength(2);
    const names = callArg.data.map((d) => d.name);
    expect(names).toContain("Finland");
    expect(names).toContain("United Kingdom");
  });

  it("records one summary when chapters are created", async () => {
    // Two non-overlapping country runs: Finland then Italy — both will be created.
    stopFindManyMock.mockResolvedValue([
      { id: "a", name: "City", arriveDate: "2026-06-26", departDate: "2026-06-30", countryCode: "fi", sortOrder: 0 },
      { id: "b", name: "City", arriveDate: "2026-06-30", departDate: "2026-07-03", countryCode: "fi", sortOrder: 1 },
      { id: "c", name: "City", arriveDate: "2026-07-10", departDate: "2026-07-18", countryCode: "it", sortOrder: 2 },
    ]);
    chapterFindManyMock.mockResolvedValue([]);
    await suggestChaptersFromCountries("trip-1");
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "CREATED",
        entityType: "CHAPTER",
        changes: { summary: expect.stringContaining("Created") },
      }),
    );
  });

  it("records nothing when no chapters are created", async () => {
    // Empty stops → suggestChapters yields no runs → data stays empty.
    stopFindManyMock.mockResolvedValue([]);
    chapterFindManyMock.mockResolvedValue([]);
    const r = await suggestChaptersFromCountries("trip-1");
    expect(r.success).toBe(true);
    if (r.success) expect(r.created).toBe(0);
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("creates a single combined chapter for an interleaved route", async () => {
    // Munich(DE) → Strasbourg(FR) → Frankfurt(DE) → Paris(FR): Germany & France interleave.
    stopFindManyMock.mockResolvedValue([
      { id: "a", name: "Munich", arriveDate: "2026-07-01", departDate: "2026-07-03", countryCode: "de", sortOrder: 0 },
      { id: "b", name: "Strasbourg", arriveDate: "2026-07-03", departDate: "2026-07-05", countryCode: "fr", sortOrder: 1 },
      { id: "c", name: "Frankfurt", arriveDate: "2026-07-05", departDate: "2026-07-07", countryCode: "de", sortOrder: 2 },
      { id: "d", name: "Paris", arriveDate: "2026-07-07", departDate: "2026-07-10", countryCode: "fr", sortOrder: 3 },
    ]);
    chapterFindManyMock.mockResolvedValue([]);
    const r = await suggestChaptersFromCountries("trip-1");
    expect(r.success).toBe(true);
    if (r.success) expect(r.created).toBe(1);
    const callArg = chapterCreateManyMock.mock.calls[0][0] as { data: { name: string; startDate: string; endDate: string }[] };
    expect(callArg.data).toHaveLength(1);
    expect(callArg.data[0]).toMatchObject({ name: "Germany & France", startDate: "2026-07-01", endDate: "2026-07-10" });
  });
});

describe("reorderChapters", () => {
  it("happy path (rough chapters): moves stop blocks and returns success", async () => {
    // Two rough chapters, no stops, no anchor → reflow is no-op.
    chapterFindManyMock.mockResolvedValue([
      { id: "c1", startDate: null, forkId: null },
      { id: "c2", startDate: null, forkId: null },
    ]);
    stopFindManyMock.mockResolvedValue([]);
    tripFindUniqueMock.mockResolvedValue({ startDate: null });
    queryRawMock.mockResolvedValue([]);

    const r = await reorderChapters("t1", ["c2", "c1"]);
    expect(r.success).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("rejects a chapter from another trip (count mismatch) — returns error, no updates", async () => {
    // Only 1 chapter found but 2 ids supplied → mismatch → reject.
    chapterFindManyMock.mockResolvedValue([{ id: "c1", startDate: null, forkId: null }]);

    const r = await reorderChapters("t1", ["c1", "c-other"]);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.chapter?.[0]).toMatch(/trip/i);
    expect(stopUpdateMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("FIX B: writes sortOrder for each chapter in the new requested order", async () => {
    // Three rough chapters reordered: c3 → c1 → c2.
    // Expected: c3 gets sortOrder 0, c1 gets sortOrder 1, c2 gets sortOrder 2.
    chapterFindManyMock.mockResolvedValue([
      { id: "c1", startDate: null, forkId: null },
      { id: "c2", startDate: null, forkId: null },
      { id: "c3", startDate: null, forkId: null },
    ]);
    stopFindManyMock.mockResolvedValue([]);
    tripFindUniqueMock.mockResolvedValue({ startDate: null });
    queryRawMock.mockResolvedValue([]);

    const r = await reorderChapters("t1", ["c3", "c1", "c2"]);
    expect(r.success).toBe(true);
    // Each chapter must receive its new sortOrder via tx.chapter.update.
    expect(chapterUpdateMock).toHaveBeenCalledWith({ where: { id: "c3" }, data: { sortOrder: 0 } });
    expect(chapterUpdateMock).toHaveBeenCalledWith({ where: { id: "c1" }, data: { sortOrder: 1 } });
    expect(chapterUpdateMock).toHaveBeenCalledWith({ where: { id: "c2" }, data: { sortOrder: 2 } });
  });
});

// ---------------------------------------------------------------------------
// Task 9: reorderChapters — dated chapters now reorderable (ADR 0021)
// ---------------------------------------------------------------------------

describe("Task 9: reorderChapters — dated chapters can be reordered and reflowed", () => {
  it("allows dated chapters to be reordered and reflows stop dates", async () => {
    // Two dated chapters: ch-A (stops a1, a2) and ch-B (stops b1).
    // New order: ch-B before ch-A.
    // Trip startDate = 2026-07-01 (anchor).
    // a1: arrive 2026-07-01, depart 2026-07-04 (3n); a2: arrive 2026-07-04, depart 2026-07-06 (2n).
    // b1: arrive 2026-07-06, depart 2026-07-09 (3n).
    // After reorder (ch-B first): b1 gets arrive 2026-07-01, depart 2026-07-04;
    //   a1 gets arrive 2026-07-04, depart 2026-07-07; a2 gets arrive 2026-07-07, depart 2026-07-09.
    chapterFindManyMock.mockResolvedValue([
      { id: "ch-A", startDate: "2026-07-01", forkId: null },
      { id: "ch-B", startDate: "2026-07-06", forkId: null },
    ]);
    stopFindManyMock.mockResolvedValue([
      { id: "a1", sortOrder: 0, chapterId: "ch-A", arriveDate: "2026-07-01", departDate: "2026-07-04", nights: null, pinned: false },
      { id: "a2", sortOrder: 1, chapterId: "ch-A", arriveDate: "2026-07-04", departDate: "2026-07-06", nights: null, pinned: false },
      { id: "b1", sortOrder: 2, chapterId: "ch-B", arriveDate: "2026-07-06", departDate: "2026-07-09", nights: null, pinned: false },
    ]);
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    queryRawMock.mockResolvedValue([
      { id: "a1", tripId: "t1", arriveDate: "2026-07-01" },
      { id: "a2", tripId: "t1", arriveDate: "2026-07-04" },
      { id: "b1", tripId: "t1", arriveDate: "2026-07-06" },
    ]);
    stopUpdateMock.mockResolvedValue({});

    const r = await reorderChapters("t1", ["ch-B", "ch-A"]);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.changed).toBeDefined();
      // b1 should be reflowed to arrive 2026-07-01
      const b1 = r.changed!.find((c) => c.id === "b1");
      expect(b1).toBeDefined();
      expect(b1!.arriveDate).toBe("2026-07-01");
      expect(b1!.departDate).toBe("2026-07-04");
    }
    // Persists the reflowed dates for b1
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "b1" }, data: { arriveDate: "2026-07-01", departDate: "2026-07-04" } });
  });

  it("returns { success, changed, conflicts } shape for dated chapter reorder", async () => {
    chapterFindManyMock.mockResolvedValue([
      { id: "ch-X", startDate: "2026-07-01", forkId: null },
    ]);
    stopFindManyMock.mockResolvedValue([
      { id: "x1", sortOrder: 0, chapterId: "ch-X", arriveDate: "2026-07-01", departDate: "2026-07-03", nights: null, pinned: false },
    ]);
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    queryRawMock.mockResolvedValue([
      { id: "x1", tripId: "t1", arriveDate: "2026-07-01" },
    ]);
    stopUpdateMock.mockResolvedValue({});

    const r = await reorderChapters("t1", ["ch-X"]);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r).toHaveProperty("changed");
      expect(r).toHaveProperty("conflicts");
      expect(Array.isArray(r.changed)).toBe(true);
      expect(Array.isArray(r.conflicts)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// fork-silent: activity must NOT fire for fork-scoped mutations
// ---------------------------------------------------------------------------

describe("fork-silent: createChapter in a fork does NOT record activity", () => {
  it("does not call recordActivity when forkId is set (fork-scoped create)", async () => {
    chapterFindManyMock.mockResolvedValue([]);
    chapterCountMock.mockResolvedValue(0);
    chapterCreateMock.mockResolvedValue({ id: "fc-1", name: "Italy", colour: "rose" });

    await createChapter("trip-1", VALID, undefined, "fork-x");

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("DOES call recordActivity when forkId is null (real-plan create)", async () => {
    chapterFindManyMock.mockResolvedValue([]);
    chapterCountMock.mockResolvedValue(0);
    chapterCreateMock.mockResolvedValue({ id: "rc-1", name: "Italy", colour: "rose" });

    await createChapter("trip-1", VALID);

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "CREATED", entityType: "CHAPTER" }),
    );
  });
});

describe("fork-silent: updateChapter in a fork does NOT record activity", () => {
  it("does not call recordActivity when chapter.forkId is non-null (fork-scoped update)", async () => {
    chapterFindUniqueMock
      .mockResolvedValueOnce({ id: "fc-2", tripId: "trip-1", forkId: "fork-x" }) // requireChapterAccess
      .mockResolvedValueOnce({ id: "fc-2", tripId: "trip-1", forkId: "fork-x", name: "Old", colour: "rose" }); // loadFullChapter
    chapterFindManyMock.mockResolvedValue([]);
    chapterUpdateMock.mockResolvedValue({ id: "fc-2", name: "Italy", colour: "rose" });

    await updateChapter("fc-2", VALID);

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("DOES call recordActivity when chapter.forkId is null (real-plan update)", async () => {
    chapterFindUniqueMock
      .mockResolvedValueOnce({ id: "rc-2", tripId: "trip-1", forkId: null }) // requireChapterAccess
      .mockResolvedValueOnce({ id: "rc-2", tripId: "trip-1", forkId: null, name: "Old", colour: "rose" }); // loadFullChapter
    chapterFindManyMock.mockResolvedValue([]);
    chapterUpdateMock.mockResolvedValue({ id: "rc-2", name: "Italy", colour: "rose" });

    await updateChapter("rc-2", VALID);

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "UPDATED", entityType: "CHAPTER" }),
    );
  });
});

describe("fork-silent: deleteChapter in a fork does NOT record activity", () => {
  it("does not call recordActivity when chapter.forkId is non-null (fork-scoped delete)", async () => {
    chapterFindUniqueMock
      .mockResolvedValueOnce({ id: "fc-3", tripId: "trip-1", forkId: "fork-x" }) // requireChapterAccess
      .mockResolvedValueOnce({ name: "Italy" }); // findUnique for label
    chapterDeleteMock.mockResolvedValue({ id: "fc-3" });

    await deleteChapter("fc-3");

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("DOES call recordActivity when chapter.forkId is null (real-plan delete)", async () => {
    chapterFindUniqueMock
      .mockResolvedValueOnce({ id: "rc-3", tripId: "trip-1", forkId: null }) // requireChapterAccess
      .mockResolvedValueOnce({ name: "Italy" }); // findUnique for label
    chapterDeleteMock.mockResolvedValue({ id: "rc-3" });

    await deleteChapter("rc-3");

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "DELETED", entityType: "CHAPTER" }),
    );
  });
});

import { CHAPTER_COLOURS } from "@/lib/chapter-colours";

const COLOUR = CHAPTER_COLOURS[0].value;

describe("createChapter — origin stop linking", () => {
  it("links a ROUGH origin stop to the new chapter", async () => {
    chapterCreateMock.mockResolvedValue({ id: "ch-new", name: "France" });
    stopFindUniqueMock.mockResolvedValue({ tripId: "trip-1", arriveDate: null, forkId: null });

    const r = await createChapter("trip-1", { name: "France", colour: COLOUR }, "stop-1");

    expect(r.success).toBe(true);
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "stop-1" },
      data: { chapterId: "ch-new", chapterSortOrder: 0 },
    });
  });

  it("does NOT link a SCHEDULED origin stop (covered by the date band)", async () => {
    stopFindUniqueMock.mockResolvedValue({ tripId: "trip-1", arriveDate: "2026-07-01" });

    const r = await createChapter("trip-1", { name: "France", colour: COLOUR }, "stop-1");

    expect(r.success).toBe(true);
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("creates a chapter with no linking when no origin stop is given", async () => {
    const r = await createChapter("trip-1", { name: "France", colour: COLOUR });

    expect(r.success).toBe(true);
    expect(stopFindUniqueMock).not.toHaveBeenCalled();
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });
});
