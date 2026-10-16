import { describe, it, expect, vi, beforeEach } from "vitest";

const { stopFindMany, chapterFindMany } = vi.hoisted(() => ({ stopFindMany: vi.fn(), chapterFindMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { stop: { findMany: stopFindMany }, chapter: { findMany: chapterFindMany } } }));

import { readSketchingPlan } from "./sketch-reads";

beforeEach(() => {
  vi.clearAllMocks();
  stopFindMany.mockResolvedValue([{ id: "s1", name: "Rome", country: "Italy", nights: 3, chapterId: null, arriveDate: null }]);
  chapterFindMany.mockResolvedValue([{ id: "c1", name: "Chapter One", colour: "sky" }]);
});

describe("readSketchingPlan (the Sketching Home's Route card)", () => {
  it("scopes the stops query to the real plan, chapter order then plan order", async () => {
    await readSketchingPlan("trip-1", true);
    expect(stopFindMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1", forkId: null },
      orderBy: [{ chapterSortOrder: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, country: true, nights: true, chapterId: true, arriveDate: true },
    });
  });

  it("scopes the chapters query to the real plan", async () => {
    await readSketchingPlan("trip-1", true);
    expect(chapterFindMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1", forkId: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, colour: true },
    });
  });

  it("skips the chapters query when Chapters are off (Task 13)", async () => {
    const rows = await readSketchingPlan("trip-1", false);
    expect(chapterFindMany).not.toHaveBeenCalled();
    expect(rows.chapters).toEqual([]);
  });

  it("returns both row sets", async () => {
    expect(await readSketchingPlan("trip-1", true)).toEqual({
      stops: [{ id: "s1", name: "Rome", country: "Italy", nights: 3, chapterId: null, arriveDate: null }],
      chapters: [{ id: "c1", name: "Chapter One", colour: "sky" }],
    });
  });
});
