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

  it("never throws — a retention failure must not fail the delete", async () => {
    deletedBlobCreateManyMock.mockRejectedValue(new Error("db down"));
    await expect(scheduleBlobDeletion(["k"])).resolves.toBeUndefined();
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
