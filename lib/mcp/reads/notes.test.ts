import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireTripAccess, requireRowAccess, noteFindMany, loadSurpriseVisibility } = vi.hoisted(() => ({
  requireTripAccess: vi.fn(),
  requireRowAccess: vi.fn(),
  noteFindMany: vi.fn(),
  loadSurpriseVisibility: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess, requireRowAccess }));
vi.mock("@/lib/db", () => ({ db: { note: { findMany: noteFindMany } } }));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility };
});

import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { MARKER_WHERE, hiddenVisibility } from "@/test/helpers/surprise-visibility";
import { loadNoteForMcp, loadNotesForMcp } from "./notes";

const row = {
  id: "n1", targetType: "ITEM", targetId: "i1", body: "Book ahead",
  createdAt: new Date("2026-10-16T09:00:00Z"),
  author: { id: "u1", name: "Cam", displayName: null, email: null, image: null },
};
const nf = () => Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

describe("Notes reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    requireRowAccess.mockResolvedValue({ row: { id: "n1", tripId: "trip-1" }, user: { id: "u1" }, surpriseOf: null });
    loadSurpriseVisibility.mockResolvedValue(NO_SURPRISES);
    noteFindMany.mockResolvedValue([row]);
  });

  it("loadNotesForMcp reads the trip's Notes in get_notes' shape", async () => {
    loadSurpriseVisibility.mockResolvedValue(hiddenVisibility({}));
    const out = await loadNotesForMcp("trip-1");
    expect(noteFindMany.mock.calls[0][0].where).toEqual({ tripId: "trip-1", ...MARKER_WHERE.note });
    expect(out).toEqual({
      notes: [{ id: "n1", targetType: "ITEM", targetId: "i1", body: "Book ahead", author: "Cam", createdAt: "2026-10-16T09:00:00.000Z" }],
    });
  });

  it("loadNoteForMcp reads one Note through the Note guard, Surprise fragment included", async () => {
    const note = await loadNoteForMcp("n1");
    expect(requireRowAccess).toHaveBeenCalledWith("note", "n1");
    expect(noteFindMany.mock.calls[0][0].where).toMatchObject({ tripId: "trip-1", id: "n1" });
    expect(note).toMatchObject({ id: "n1", body: "Book ahead", targetType: "ITEM", targetId: "i1" });
  });

  it("loadNoteForMcp on a Note the guard refuses (missing, not yours, inside a hidden Surprise) is notFound", async () => {
    requireRowAccess.mockRejectedValue(nf());
    await expect(loadNoteForMcp("n1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(noteFindMany).not.toHaveBeenCalled();
  });

  it("loadNoteForMcp is notFound when the visibility fragment filters the Note out", async () => {
    noteFindMany.mockResolvedValue([]);
    await expect(loadNoteForMcp("n1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});
