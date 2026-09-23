import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for scheduleBlobDeletion (ARCH-DAT-3).
 * Mocks: @/lib/db (deletedBlob.createMany). @/lib/storage is mocked too, purely
 * to prove this module never touches storage directly — destruction happens
 * later, in scripts/sweep-deleted-blobs.ts.
 */

const { deletedBlobCreateManyMock, storageDeleteMock } = vi.hoisted(() => ({
  deletedBlobCreateManyMock: vi.fn(),
  storageDeleteMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    deletedBlob: { createMany: deletedBlobCreateManyMock },
  },
}));

vi.mock("@/lib/storage", () => ({
  getStorage: vi.fn(() => ({ delete: storageDeleteMock })),
}));

import { scheduleBlobDeletion } from "./blob-retention";

const dbMock = { deletedBlob: { createMany: deletedBlobCreateManyMock } };
const storageMock = { delete: storageDeleteMock };

afterEach(() => {
  vi.clearAllMocks();
});

describe("scheduleBlobDeletion", () => {
  it("records keys for later sweeping instead of destroying them", async () => {
    deletedBlobCreateManyMock.mockResolvedValue({ count: 2 });

    await scheduleBlobDeletion(["trips/t1/a.pdf", null, "trips/t1/b.png"]);

    expect(storageMock.delete).not.toHaveBeenCalled();
    expect(dbMock.deletedBlob.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ storageKey: "trips/t1/a.pdf" }, { storageKey: "trips/t1/b.png" }],
        skipDuplicates: true,
      }),
    );
  });

  it("is a no-op for an empty list", async () => {
    await scheduleBlobDeletion([]);
    expect(dbMock.deletedBlob.createMany).not.toHaveBeenCalled();
  });

  it("filters out an all-nullish list without calling the db", async () => {
    await scheduleBlobDeletion([null, undefined]);
    expect(dbMock.deletedBlob.createMany).not.toHaveBeenCalled();
  });

  it("never throws on the DEFAULT client — a retention failure must not fail the delete", async () => {
    deletedBlobCreateManyMock.mockRejectedValue(new Error("db down"));
    await expect(scheduleBlobDeletion(["k"])).resolves.toBeUndefined();
  });

  it("never throws when the default client is passed explicitly", async () => {
    deletedBlobCreateManyMock.mockRejectedValue(new Error("db down"));
    const { db } = await import("@/lib/db");
    await expect(
      scheduleBlobDeletion(["k"], db as unknown as Parameters<typeof scheduleBlobDeletion>[1]),
    ).resolves.toBeUndefined();
  });

  // C2 (final fix wave): the swallow used to apply to the transaction path
  // too, on the reasoning that it "can't roll back a transaction whose other
  // statements succeeded". Postgres disagrees — it aborts the whole
  // transaction on the first error, so swallowing hides an abort rather than
  // preventing one, and the caller's COMMIT silently becomes a ROLLBACK
  // while the action returns { success: true }.
  it("PROPAGATES on a transaction client — a swallowed error there makes the delete a silent no-op", async () => {
    const boom = new Error("insert failed inside the transaction");
    const txCreateManyMock = vi.fn().mockRejectedValue(boom);
    const fakeTx = { deletedBlob: { createMany: txCreateManyMock } };

    await expect(
      scheduleBlobDeletion(["k1"], fakeTx as unknown as Parameters<typeof scheduleBlobDeletion>[1]),
    ).rejects.toBe(boom);
  });

  // Fix round 1, I3: callers that already hold a transaction handle (e.g.
  // cleanupTargetSideDataTx, uploadAttachment's partial-write cleanup) can
  // pass it here so the DeletedBlob write commits atomically with the row
  // delete it accompanies — a process crash between "row gone" and "blob
  // recorded" can otherwise orphan a blob with no pointer at all, invisible
  // even to the sweep.
  it("writes through a caller-supplied client (e.g. a transaction handle) instead of the default db", async () => {
    const txCreateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const fakeTx = { deletedBlob: { createMany: txCreateManyMock } };

    await scheduleBlobDeletion(["k1"], fakeTx as unknown as Parameters<typeof scheduleBlobDeletion>[1]);

    expect(txCreateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ storageKey: "k1" }],
        skipDuplicates: true,
      }),
    );
    // The default client (the module-level db) must not have been touched.
    expect(dbMock.deletedBlob.createMany).not.toHaveBeenCalled();
  });
});
