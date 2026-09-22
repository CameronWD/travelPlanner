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
});
