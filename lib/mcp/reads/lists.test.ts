import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireRowAccess: vi.fn(), requireTripAccess: vi.fn(), requireRealPlanRow: vi.fn(), loadSurpriseVisibility: vi.fn(),
  checklistFindUnique: vi.fn(), checklistFindMany: vi.fn(), itemFindFirst: vi.fn(), voteFindMany: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireRowAccess: m.requireRowAccess, requireTripAccess: m.requireTripAccess }));
vi.mock("../real-plan", () => ({ requireRealPlanRow: m.requireRealPlanRow }));
vi.mock("@/lib/db", () => ({
  db: {
    checklistItem: { findUnique: m.checklistFindUnique, findMany: m.checklistFindMany },
    item: { findFirst: m.itemFindFirst },
    vote: { findMany: m.voteFindMany },
  },
}));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: m.loadSurpriseVisibility };
});

import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";
import { loadChecklistItemForMcp, loadChecklistOfItemForMcp, loadVotesForMcp, loadWishlistIdeaForMcp } from "./lists";

const cam = { id: "u1", name: "Cam", displayName: null, email: null, image: null };
const ci = (id: string, sortOrder: number) => ({ id, kind: "PACKING", text: id, done: false, dueDate: null, sortOrder, buy: null });

beforeEach(() => {
  vi.clearAllMocks();
  m.requireRowAccess.mockResolvedValue({ row: { id: "ci-1", tripId: "trip-1", kind: "PACKING" }, user: { id: "u1" } });
  m.requireRealPlanRow.mockResolvedValue({ tripId: "trip-1" });
  m.requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
  m.loadSurpriseVisibility.mockResolvedValue(NO_SURPRISES);
});

describe("Checklist readers", () => {
  it("loadChecklistItemForMcp reads one item in get_checklists' shape, plus its list", async () => {
    m.checklistFindUnique.mockResolvedValue({ ...ci("ci-1", 0), buy: "NEEDED" });
    expect(await loadChecklistItemForMcp("ci-1")).toEqual({ id: "ci-1", text: "ci-1", done: false, dueDate: null, buyState: "NEEDED", kind: "PACKING" });
    expect(m.requireRowAccess).toHaveBeenCalledWith("checklistItem", "ci-1");
  });

  it("loadChecklistOfItemForMcp reads the item's whole list in its order", async () => {
    m.checklistFindMany.mockResolvedValue([ci("b", 1), ci("a", 0)]);
    const out = await loadChecklistOfItemForMcp("ci-1");
    expect(m.checklistFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip-1", kind: "PACKING" } }));
    expect(out).toEqual({ kind: "PACKING", items: [expect.objectContaining({ id: "a" }), expect.objectContaining({ id: "b" })] });
  });
});

describe("Wishlist readers", () => {
  it("loadWishlistIdeaForMcp reads one real-plan idea in get_wishlist's shape", async () => {
    m.itemFindFirst.mockResolvedValue({ id: "i1", title: "Sintra", category: "PLACE", notes: null, link: null, votes: [{ level: "KEEN", user: cam }] });
    expect(await loadWishlistIdeaForMcp("i1")).toEqual({ id: "i1", title: "Sintra", category: "PLACE", notes: null, link: null, votes: [{ traveller: "Cam", level: "KEEN" }] });
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("item", "i1");
    expect(m.itemFindFirst.mock.calls[0][0].where).toMatchObject({ id: "i1", tripId: "trip-1", forkId: null, stopId: null, date: null });
  });

  it("loadWishlistIdeaForMcp carries the Surprise fragment, and a filtered-out idea is notFound", async () => {
    m.loadSurpriseVisibility.mockResolvedValue(hiddenVisibility({ hiddenStopIds: ["s-secret"] }));
    m.itemFindFirst.mockResolvedValue(null);
    await expect(loadWishlistIdeaForMcp("i1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(m.itemFindFirst.mock.calls[0][0].where).toMatchObject(MARKER_WHERE.item);
  });

  it("loadVotesForMcp reads the Votes on any real-plan Item", async () => {
    m.voteFindMany.mockResolvedValue([{ level: "MUST", user: cam }]);
    expect(await loadVotesForMcp("i1")).toEqual({ itemId: "i1", votes: [{ traveller: "Cam", level: "MUST" }] });
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("item", "i1");
  });
});
