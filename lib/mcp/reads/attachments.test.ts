import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireTripAccess, attachmentFindMany, stopFindMany, accommodationFindMany, transportFindMany, itemFindMany } =
  vi.hoisted(() => ({
    requireTripAccess: vi.fn(),
    attachmentFindMany: vi.fn(),
    stopFindMany: vi.fn(),
    accommodationFindMany: vi.fn(),
    transportFindMany: vi.fn(),
    itemFindMany: vi.fn(),
  }));

vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/lib/db", () => ({
  db: {
    attachment: { findMany: attachmentFindMany },
    stop: { findMany: stopFindMany },
    accommodation: { findMany: accommodationFindMany },
    transport: { findMany: transportFindMany },
    item: { findMany: itemFindMany },
  },
}));

import { loadAttachmentIndexForMcp, loadTripAttachments } from "./attachments";

const TRIP_ID = "trip-1";
const uploader = { id: "u1", name: "Cam", displayName: null, email: "cam@x", image: null };

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "att-1",
    filename: "ticket.pdf",
    title: null,
    mime: "application/pdf",
    size: 1234,
    targetType: "TRIP",
    targetId: null,
    uploadedBy: uploader,
    ...overrides,
  };
}

describe("loadTripAttachments / loadAttachmentIndexForMcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    attachmentFindMany.mockResolvedValue([]);
    stopFindMany.mockResolvedValue([]);
    accommodationFindMany.mockResolvedValue([]);
    transportFindMany.mockResolvedValue([]);
    itemFindMany.mockResolvedValue([]);
  });

  it("lists trip files with title, type, size, uploader and named owner", async () => {
    attachmentFindMany.mockResolvedValue([
      row({
        id: "att-item",
        filename: "museum-tickets.pdf",
        title: "Museum tickets",
        size: 5000,
        targetType: "ITEM",
        targetId: "item-1",
      }),
    ]);
    itemFindMany.mockResolvedValue([{ id: "item-1", title: "Neuschwanstein tour", stopId: "stop-1", date: "2026-12-18", forkId: null }]);
    stopFindMany.mockResolvedValue([{ id: "stop-1", name: "Füssen" }]);

    const { attachments } = await loadTripAttachments(TRIP_ID);
    expect(attachments).toEqual([
      {
        id: "att-item",
        title: "Museum tickets",
        filename: "museum-tickets.pdf",
        mime: "application/pdf",
        size: 5000,
        uploadedBy: "Cam",
        owner: { kind: "ITEM", label: "Activity: Neuschwanstein tour at Füssen, Fri 18 Dec" },
      },
    ]);
  });

  it("title falls back to filename", async () => {
    attachmentFindMany.mockResolvedValue([row({ title: null, filename: "boarding-pass.pdf" })]);
    const { attachments } = await loadTripAttachments(TRIP_ID);
    expect(attachments[0]!.title).toBe("boarding-pass.pdf");
  });

  it("excludes files whose owner is on a What-if plan", async () => {
    attachmentFindMany.mockResolvedValue([row({ id: "att-fork", targetType: "STOP", targetId: "stop-fork" })]);
    stopFindMany.mockResolvedValue([{ id: "stop-fork", name: "Forked Stop", forkId: "fork-1" }]);

    const { attachments, byOwner } = await loadTripAttachments(TRIP_ID);
    expect(attachments).toEqual([]);
    expect(byOwner.size).toBe(0);
  });

  it("keeps a file whose owner was deleted, named (removed)", async () => {
    attachmentFindMany.mockResolvedValue([row({ id: "att-gone", targetType: "ITEM", targetId: "item-gone" })]);
    itemFindMany.mockResolvedValue([]); // owner row no longer exists

    const { attachments } = await loadTripAttachments(TRIP_ID);
    expect(attachments).toEqual([
      expect.objectContaining({ id: "att-gone", owner: { kind: "ITEM", label: "(removed)" } }),
    ]);
  });

  it("never lists Globe files (queries by tripId only)", async () => {
    await loadTripAttachments(TRIP_ID);
    expect(attachmentFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: TRIP_ID } }));
  });

  it("lists a trip-level file under owner Trip, and grabs it via the TRIP key", async () => {
    attachmentFindMany.mockResolvedValue([row({ id: "att-trip", targetType: "TRIP", targetId: null })]);
    const { attachments, byOwner } = await loadTripAttachments(TRIP_ID);
    expect(attachments[0]!.owner).toEqual({ kind: "TRIP", label: "Trip" });
    expect(byOwner.get("TRIP:trip-1")).toEqual([{ id: "att-trip", title: "ticket.pdf" }]);
  });

  it("gives a non-plan target type (e.g. JOURNAL) a sensible label and no owner entry", async () => {
    attachmentFindMany.mockResolvedValue([row({ id: "att-journal", targetType: "JOURNAL", targetId: "2026-12-18" })]);
    const { attachments, byOwner } = await loadTripAttachments(TRIP_ID);
    expect(attachments[0]!.owner).toEqual({ kind: "TRIP", label: "Journal" });
    expect(byOwner.size).toBe(0);
  });

  it("is access-checked first", async () => {
    await loadAttachmentIndexForMcp(TRIP_ID);
    const accessOrder = requireTripAccess.mock.invocationCallOrder[0]!;
    expect(attachmentFindMany.mock.invocationCallOrder[0]!).toBeGreaterThan(accessOrder);
  });

  it("propagates a not-found from requireTripAccess without reading the db", async () => {
    requireTripAccess.mockRejectedValue(Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
    await expect(loadAttachmentIndexForMcp(TRIP_ID)).rejects.toThrow();
    expect(attachmentFindMany).not.toHaveBeenCalled();
  });
});
