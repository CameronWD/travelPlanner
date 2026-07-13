import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for cleanupTargetSideData helper.
 * Mocks: @/lib/db (attachment.findMany/deleteMany, note.deleteMany), @/lib/storage
 */

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  attachmentFindManyMock,
  attachmentDeleteManyMock,
  noteDeleteManyMock,
  storageDeleteMock,
} = vi.hoisted(() => ({
  attachmentFindManyMock: vi.fn(),
  attachmentDeleteManyMock: vi.fn(),
  noteDeleteManyMock: vi.fn(),
  storageDeleteMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    attachment: {
      findMany: attachmentFindManyMock,
      deleteMany: attachmentDeleteManyMock,
    },
    note: {
      deleteMany: noteDeleteManyMock,
    },
  },
}));

vi.mock("@/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...real,
    getStorage: vi.fn(() => ({
      delete: storageDeleteMock,
    })),
  };
});

import { cleanupTargetSideData } from "./target-cleanup";

beforeEach(() => {
  vi.clearAllMocks();
  attachmentDeleteManyMock.mockResolvedValue({ count: 0 });
  noteDeleteManyMock.mockResolvedValue({ count: 0 });
  storageDeleteMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// cleanupTargetSideData
// ---------------------------------------------------------------------------

describe("cleanupTargetSideData", () => {
  it("deletes attachments (with blobs) and notes for a target", async () => {
    attachmentFindManyMock.mockResolvedValue([
      { id: "a1", storageKey: "k1" },
      { id: "a2", storageKey: null },
    ]);

    await cleanupTargetSideData("t1", "TRANSPORT", "tr1");

    expect(storageDeleteMock).toHaveBeenCalledWith("k1");
    expect(storageDeleteMock).toHaveBeenCalledTimes(1);
    expect(attachmentDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: "t1", targetType: "TRANSPORT", targetId: "tr1" },
    });
    expect(noteDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: "t1", targetType: "TRANSPORT", targetId: "tr1" },
    });
  });

  it("calls storage.delete for each non-null storageKey", async () => {
    attachmentFindManyMock.mockResolvedValue([
      { id: "a1", storageKey: "key-a" },
      { id: "a2", storageKey: "key-b" },
      { id: "a3", storageKey: null },
    ]);

    await cleanupTargetSideData("t2", "STOP", "stop-1");

    expect(storageDeleteMock).toHaveBeenCalledTimes(2);
    expect(storageDeleteMock).toHaveBeenCalledWith("key-a");
    expect(storageDeleteMock).toHaveBeenCalledWith("key-b");
  });

  it("does not call storage.delete when there are no attachments", async () => {
    attachmentFindManyMock.mockResolvedValue([]);

    await cleanupTargetSideData("t3", "ITEM", "item-1");

    expect(storageDeleteMock).not.toHaveBeenCalled();
    expect(attachmentDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: "t3", targetType: "ITEM", targetId: "item-1" },
    });
    expect(noteDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: "t3", targetType: "ITEM", targetId: "item-1" },
    });
  });

  it("swallows storage.delete errors (best-effort) and continues", async () => {
    attachmentFindManyMock.mockResolvedValue([
      { id: "a1", storageKey: "bad-key" },
      { id: "a2", storageKey: "good-key" },
    ]);
    storageDeleteMock
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce(undefined);

    // Should not throw
    await expect(
      cleanupTargetSideData("t4", "ACCOMMODATION", "acc-1"),
    ).resolves.toBeUndefined();

    // Both deletes were attempted
    expect(storageDeleteMock).toHaveBeenCalledTimes(2);
    // DB cleanup still ran
    expect(attachmentDeleteManyMock).toHaveBeenCalled();
    expect(noteDeleteManyMock).toHaveBeenCalled();
  });

  it("passes correct targetType for ACCOMMODATION", async () => {
    attachmentFindManyMock.mockResolvedValue([]);

    await cleanupTargetSideData("trip-5", "ACCOMMODATION", "acc-99");

    expect(attachmentFindManyMock).toHaveBeenCalledWith({
      where: { tripId: "trip-5", targetType: "ACCOMMODATION", targetId: "acc-99" },
      select: { id: true, storageKey: true },
    });
    expect(attachmentDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: "trip-5", targetType: "ACCOMMODATION", targetId: "acc-99" },
    });
    expect(noteDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: "trip-5", targetType: "ACCOMMODATION", targetId: "acc-99" },
    });
  });
});
