import { afterEach, describe, expect, it, vi } from "vitest";

const {
  requireTripAccessMock, revalidatePathMock,
  chapterFindUniqueMock, chapterFindManyMock, chapterCountMock, chapterCreateMock, chapterCreateManyMock, chapterUpdateMock, chapterDeleteMock,
  stopFindManyMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } }),
  revalidatePathMock: vi.fn(),
  chapterFindUniqueMock: vi.fn(),
  chapterFindManyMock: vi.fn().mockResolvedValue([]),
  chapterCountMock: vi.fn().mockResolvedValue(0),
  chapterCreateMock: vi.fn().mockResolvedValue({ id: "c1" }),
  chapterCreateManyMock: vi.fn().mockResolvedValue({ count: 0 }),
  chapterUpdateMock: vi.fn().mockResolvedValue({ id: "c1" }),
  chapterDeleteMock: vi.fn().mockResolvedValue({ id: "c1" }),
  stopFindManyMock: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/db", () => ({
  db: {
    chapter: { findUnique: chapterFindUniqueMock, findMany: chapterFindManyMock, count: chapterCountMock, create: chapterCreateMock, createMany: chapterCreateManyMock, update: chapterUpdateMock, delete: chapterDeleteMock },
    stop: { findMany: stopFindManyMock },
  },
}));

import { createChapter, updateChapter, deleteChapter, suggestChaptersFromCountries } from "./chapters";
import type { ChapterInput } from "@/lib/validations/chapter";

const VALID: ChapterInput = { name: "Italy", colour: "rose", startDate: "2026-07-10", endDate: "2026-07-18" };

afterEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } });
  chapterFindManyMock.mockResolvedValue([]);
  chapterCountMock.mockResolvedValue(0);
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
    chapterCreateMock.mockResolvedValue({ id: "c2" });
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
});

describe("updateChapter", () => {
  it("excludes itself from the overlap check", async () => {
    chapterFindUniqueMock.mockResolvedValue({ id: "c1", tripId: "trip-1" });
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
});

describe("deleteChapter", () => {
  it("deletes and revalidates", async () => {
    chapterFindUniqueMock.mockResolvedValue({ id: "c1", tripId: "trip-1" });
    const r = await deleteChapter("c1");
    expect(r.success).toBe(true);
    expect(chapterDeleteMock).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});

describe("suggestChaptersFromCountries", () => {
  it("creates one chapter per country run, skipping runs that overlap existing chapters", async () => {
    stopFindManyMock.mockResolvedValue([
      { id: "a", arriveDate: "2026-06-26", departDate: "2026-06-30", country: "Finland", sortOrder: 0 },
      { id: "b", arriveDate: "2026-06-30", departDate: "2026-07-03", country: "Finland", sortOrder: 1 },
      { id: "c", arriveDate: "2026-07-10", departDate: "2026-07-18", country: "Italy", sortOrder: 2 },
    ]);
    chapterFindManyMock.mockResolvedValue([{ id: "ex", startDate: "2026-07-09", endDate: "2026-07-20" }]);
    const r = await suggestChaptersFromCountries("trip-1");
    expect(r.success).toBe(true);
    expect(chapterCreateManyMock).toHaveBeenCalledWith({ data: [expect.objectContaining({ name: "Finland", tripId: "trip-1" })] });
  });

  it("creates chapters for BOTH countries in a back-to-back trip sharing a boundary day", async () => {
    // Finland departs 2026-07-03; UK arrives 2026-07-03 — the shared boundary day
    // used to cause chaptersOverlap to fire and skip UK. After the fix, the runs
    // are trimmed so Finland ends 2026-07-02 and both chapters are created.
    stopFindManyMock.mockResolvedValue([
      { id: "a", arriveDate: "2026-06-26", departDate: "2026-06-30", country: "Finland", sortOrder: 0 },
      { id: "b", arriveDate: "2026-06-30", departDate: "2026-07-03", country: "Finland", sortOrder: 1 },
      { id: "c", arriveDate: "2026-07-03", departDate: "2026-07-07", country: "United Kingdom", sortOrder: 2 },
    ]);
    chapterFindManyMock.mockResolvedValue([]);
    const r = await suggestChaptersFromCountries("trip-1");
    expect(r.success).toBe(true);
    const callArg = chapterCreateManyMock.mock.calls[0][0] as { data: { name: string }[] };
    expect(callArg.data).toHaveLength(2);
    const names = callArg.data.map((d) => d.name);
    expect(names).toContain("Finland");
    expect(names).toContain("United Kingdom");
  });
});
