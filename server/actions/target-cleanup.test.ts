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
  scheduleBlobDeletionMock,
} = vi.hoisted(() => ({
  attachmentFindManyMock: vi.fn(),
  attachmentDeleteManyMock: vi.fn(),
  noteDeleteManyMock: vi.fn(),
  storageDeleteMock: vi.fn(),
  scheduleBlobDeletionMock: vi.fn(),
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

// ARCH-DAT-3: blob destruction is deferred. cleanupTargetSideData /
// cleanupGlobeAttachments / cleanupTargetSideDataTx no longer call
// storage.delete directly — they hand storage keys to scheduleBlobDeletion,
// which records them in DeletedBlob for scripts/sweep-deleted-blobs.ts to
// destroy later. (deleteBlobsBestEffort was deleted in fix round 1, I4 — its
// only job, scheduling AFTER a $transaction committed, moved inside
// cleanupTargetSideDataTx itself, see below.)
vi.mock("@/lib/blob-retention", () => ({
  scheduleBlobDeletion: scheduleBlobDeletionMock,
}));

import { cleanupTargetSideData, cleanupTargetSideDataTx } from "./target-cleanup";

beforeEach(() => {
  vi.clearAllMocks();
  attachmentDeleteManyMock.mockResolvedValue({ count: 0 });
  noteDeleteManyMock.mockResolvedValue({ count: 0 });
  storageDeleteMock.mockResolvedValue(undefined);
  scheduleBlobDeletionMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// cleanupTargetSideData
// ---------------------------------------------------------------------------

describe("cleanupTargetSideData", () => {
  it("schedules attachment blobs for retention (ARCH-DAT-3) and deletes notes for a target", async () => {
    attachmentFindManyMock.mockResolvedValue([
      { id: "a1", storageKey: "k1" },
      { id: "a2", storageKey: null },
    ]);

    await cleanupTargetSideData("t1", "TRANSPORT", "tr1");

    expect(storageDeleteMock).not.toHaveBeenCalled();
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(["k1", null]);
    expect(attachmentDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: "t1", targetType: "TRANSPORT", targetId: "tr1" },
    });
    expect(noteDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: "t1", targetType: "TRANSPORT", targetId: "tr1" },
    });
  });

  it("schedules retention for every attachment's storageKey (nulls included, filtered downstream)", async () => {
    attachmentFindManyMock.mockResolvedValue([
      { id: "a1", storageKey: "key-a" },
      { id: "a2", storageKey: "key-b" },
      { id: "a3", storageKey: null },
    ]);

    await cleanupTargetSideData("t2", "STOP", "stop-1");

    expect(storageDeleteMock).not.toHaveBeenCalled();
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(["key-a", "key-b", null]);
  });

  it("still schedules retention (with an empty list) when there are no attachments", async () => {
    attachmentFindManyMock.mockResolvedValue([]);

    await cleanupTargetSideData("t3", "ITEM", "item-1");

    expect(storageDeleteMock).not.toHaveBeenCalled();
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith([]);
    expect(attachmentDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: "t3", targetType: "ITEM", targetId: "item-1" },
    });
    expect(noteDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: "t3", targetType: "ITEM", targetId: "item-1" },
    });
  });

  it("swallows a scheduleBlobDeletion failure (best-effort) and still cleans up the rows", async () => {
    attachmentFindManyMock.mockResolvedValue([
      { id: "a1", storageKey: "bad-key" },
      { id: "a2", storageKey: "good-key" },
    ]);
    scheduleBlobDeletionMock.mockRejectedValueOnce(new Error("db down"));

    // Should not throw
    await expect(
      cleanupTargetSideData("t4", "ACCOMMODATION", "acc-1"),
    ).resolves.toBeUndefined();

    // Minor (fix round 1): this used to be vacuous — without asserting
    // scheduleBlobDeletion was actually reached, a revert to a direct
    // per-key storage.delete loop (which would never call the rejecting
    // mock at all) would pass this test too, since the DB-cleanup
    // assertions below don't depend on it. Prove the rejected mock was
    // really exercised, and that no direct storage.delete crept back in.
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(["bad-key", "good-key"]);
    expect(storageDeleteMock).not.toHaveBeenCalled();
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

// ---------------------------------------------------------------------------
// cleanupTargetSideDataTx
// ---------------------------------------------------------------------------

describe("cleanupTargetSideDataTx", () => {
  function fakeTx(attachments: { storageKey: string | null }[]) {
    return {
      attachment: {
        findMany: vi.fn().mockResolvedValue(attachments),
        deleteMany: vi.fn().mockResolvedValue({ count: attachments.length }),
      },
      note: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("deletes attachment and note rows, and schedules blob retention, all inside the SAME tx (I3, fix round 1)", async () => {
    const tx = fakeTx([{ storageKey: "k1" }, { storageKey: null }]);

    const keys = await cleanupTargetSideDataTx(tx, "t1", "TRANSPORT", "tr1");

    expect(keys).toEqual(["k1"]);
    expect(tx.attachment.findMany).toHaveBeenCalledWith({
      where: { tripId: "t1", targetType: "TRANSPORT", targetId: "tr1" },
      select: { storageKey: true },
    });
    expect(tx.attachment.deleteMany).toHaveBeenCalledWith({
      where: { tripId: "t1", targetType: "TRANSPORT", targetId: "tr1" },
    });
    expect(tx.note.deleteMany).toHaveBeenCalledWith({
      where: { tripId: "t1", targetType: "TRANSPORT", targetId: "tr1" },
    });
    expect(storageDeleteMock).not.toHaveBeenCalled();
    // scheduleBlobDeletion is called with the SAME tx handle (not the
    // post-commit global db) — that's what makes the row deletes and the
    // DeletedBlob write commit or roll back together.
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(["k1"], tx);
  });

  it("returns an empty array when there are no attachments", async () => {
    const tx = fakeTx([]);

    const keys = await cleanupTargetSideDataTx(tx, "t2", "ITEM", "item-1");

    expect(keys).toEqual([]);
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith([], tx);
  });

  it("filters out null storageKeys", async () => {
    const tx = fakeTx([{ storageKey: null }, { storageKey: "k2" }, { storageKey: null }]);

    const keys = await cleanupTargetSideDataTx(tx, "t3", "ACCOMMODATION", "acc-1");

    expect(keys).toEqual(["k2"]);
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(["k2"], tx);
  });
});
