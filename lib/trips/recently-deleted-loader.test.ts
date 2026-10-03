import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { tripMember: { findMany: m.findMany } } }));

import { loadRecentlyDeleted } from "./recently-deleted-loader";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadRecentlyDeleted", () => {
  it("queries tripMember for the user's owner memberships on deleted Trips, newest first", async () => {
    m.findMany.mockResolvedValue([]);

    await loadRecentlyDeleted("u1");

    expect(m.findMany).toHaveBeenCalledWith({
      where: { userId: "u1", role: "owner", trip: { deletedAt: { not: null } } },
      select: { trip: { select: { id: true, name: true, slug: true, deletedAt: true } } },
      orderBy: { trip: { deletedAt: "desc" } },
    });
  });

  it("flattens the membership rows into Trip objects", async () => {
    const deletedAt = new Date("2026-09-20");
    m.findMany.mockResolvedValue([
      { trip: { id: "t1", name: "Japan", slug: "japan", deletedAt } },
    ]);

    const result = await loadRecentlyDeleted("u1");

    expect(result).toEqual([{ id: "t1", name: "Japan", slug: "japan", deletedAt }]);
  });

  it("returns an empty array when there are no deleted Trips", async () => {
    m.findMany.mockResolvedValue([]);

    expect(await loadRecentlyDeleted("u1")).toEqual([]);
  });
});
