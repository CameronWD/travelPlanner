import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/**
 * Tests for the Item photo server actions (CONTEXT.md "Item photo", spec §I).
 * Mocks: lib/db, lib/guards, lib/storage, lib/blob-retention, lib/error-sink,
 * next/cache, next/navigation, server/actions/attachments (createAttachmentFromFile).
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  notFoundMock,
  itemFindUniqueMock,
  itemUpdateMock,
  attachmentFindUniqueMock,
  attachmentCreateMock,
  attachmentUpdateMock,
  attachmentDeleteMock,
  createAttachmentFromFileMock,
  scheduleBlobDeletionMock,
  storageCopyMock,
  reportErrorMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  revalidatePathMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  itemFindUniqueMock: vi.fn(),
  itemUpdateMock: vi.fn().mockResolvedValue({}),
  attachmentFindUniqueMock: vi.fn(),
  attachmentCreateMock: vi.fn(),
  attachmentUpdateMock: vi.fn().mockResolvedValue({}),
  attachmentDeleteMock: vi.fn().mockResolvedValue({}),
  createAttachmentFromFileMock: vi.fn(),
  scheduleBlobDeletionMock: vi.fn().mockResolvedValue(undefined),
  storageCopyMock: vi.fn().mockResolvedValue(undefined),
  reportErrorMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/blob-retention", () => ({ scheduleBlobDeletion: scheduleBlobDeletionMock }));
vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));
vi.mock("@/server/actions/attachments", () => ({
  createAttachmentFromFile: createAttachmentFromFileMock,
}));
vi.mock("@/lib/storage", async (importOriginal) => {
  // Keep pure helpers (generateKey, validateUpload) real; mock getStorage()
  // for a controlled copy() spy.
  const real = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...real,
    getStorage: vi.fn(() => ({
      copy: storageCopyMock,
      save: vi.fn(),
      delete: vi.fn(),
      read: vi.fn().mockResolvedValue(null),
      presignDownload: vi.fn().mockResolvedValue(null),
    })),
  };
});
vi.mock("@/lib/db", () => ({
  db: {
    item: {
      findUnique: itemFindUniqueMock,
      update: itemUpdateMock,
    },
    attachment: {
      findUnique: attachmentFindUniqueMock,
      create: attachmentCreateMock,
      update: attachmentUpdateMock,
      delete: attachmentDeleteMock,
    },
  },
}));

import { setItemPhoto, removeItemPhoto, copyItemPhoto } from "./item-photo";

const TRIP_ID = "trip-1";
const ITEM_ID = "item-1";

function makeFormData(overrides: Record<string, string | File> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string | File> = {
    itemId: ITEM_ID,
    file: new File(["png-bytes"], "photo.png", { type: "image/png" }),
  };
  const merged = { ...defaults, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    fd.set(key, value);
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
  itemFindUniqueMock.mockResolvedValue({ id: ITEM_ID, tripId: TRIP_ID, photoAttachmentId: null });
  createAttachmentFromFileMock.mockResolvedValue({
    success: true,
    id: "new-att-1",
    storageKey: `trips/${TRIP_ID}/new-att-1-photo.png`,
    url: "/api/attachments/new-att-1",
  });
});

// ---------------------------------------------------------------------------
// setItemPhoto
// ---------------------------------------------------------------------------

describe("setItemPhoto", () => {
  it("refuses a non-image file (e.g. a PDF)", async () => {
    const fd = makeFormData({ file: new File(["%PDF"], "doc.pdf", { type: "application/pdf" }) });

    const result = await setItemPhoto(fd);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.file?.[0]).toMatch(/image/i);
    expect(createAttachmentFromFileMock).not.toHaveBeenCalled();
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  it("on a PNG: creates the attachment and sets photoAttachmentId", async () => {
    const result = await setItemPhoto(makeFormData());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.attachmentId).toBe("new-att-1");
    expect(createAttachmentFromFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: TRIP_ID,
        targetType: "ITEM",
        targetId: ITEM_ID,
        userId: "user-1",
      }),
    );
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { photoAttachmentId: "new-att-1" },
    });
    // No existing photo — nothing to discard.
    expect(attachmentDeleteMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}`, "layout");
  });

  it("access-checks via the item's tripId before uploading", async () => {
    await setItemPhoto(makeFormData());
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, itemUpdateMock);
  });

  it("a second call deletes the first photo's attachment (blob scheduled, row deleted)", async () => {
    itemFindUniqueMock.mockResolvedValue({
      id: ITEM_ID,
      tripId: TRIP_ID,
      photoAttachmentId: "old-att-1",
    });
    attachmentFindUniqueMock.mockResolvedValue({ storageKey: `trips/${TRIP_ID}/old-att-1-old.png` });

    const result = await setItemPhoto(makeFormData());

    expect(result.success).toBe(true);
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith([`trips/${TRIP_ID}/old-att-1-old.png`]);
    expect(attachmentDeleteMock).toHaveBeenCalledWith({ where: { id: "old-att-1" } });
    // The replacement lands (column set) — not before the delete is even
    // possible, but the new attachment id must differ from the old one.
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { photoAttachmentId: "new-att-1" },
    });
  });

  it("propagates a createAttachmentFromFile failure without touching the item", async () => {
    createAttachmentFromFileMock.mockResolvedValue({
      success: false,
      error: "Upload failed — nothing was saved. Please try again.",
    });

    const result = await setItemPhoto(makeFormData());

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.file?.[0]).toBe("Upload failed — nothing was saved. Please try again.");
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// removeItemPhoto
// ---------------------------------------------------------------------------

describe("removeItemPhoto", () => {
  it("deletes the attachment and nulls the column", async () => {
    itemFindUniqueMock.mockResolvedValue({
      id: ITEM_ID,
      tripId: TRIP_ID,
      photoAttachmentId: "old-att-1",
    });
    attachmentFindUniqueMock.mockResolvedValue({ storageKey: `trips/${TRIP_ID}/old-att-1-old.png` });

    const result = await removeItemPhoto(ITEM_ID);

    expect(result.success).toBe(true);
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith([`trips/${TRIP_ID}/old-att-1-old.png`]);
    expect(attachmentDeleteMock).toHaveBeenCalledWith({ where: { id: "old-att-1" } });
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { photoAttachmentId: null },
    });
  });

  it("is a no-op when the Item has no photo set", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: ITEM_ID, tripId: TRIP_ID, photoAttachmentId: null });

    const result = await removeItemPhoto(ITEM_ID);

    expect(result.success).toBe(true);
    expect(attachmentDeleteMock).not.toHaveBeenCalled();
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// copyItemPhoto
// ---------------------------------------------------------------------------

describe("copyItemPhoto", () => {
  it("copies the storage object to a new key and creates a new ITEM attachment", async () => {
    attachmentFindUniqueMock.mockResolvedValue({
      storageKey: `trips/${TRIP_ID}/src-att-old.png`,
      filename: "old.png",
      mime: "image/png",
      size: 1234,
      uploadedById: "user-1",
    });
    attachmentCreateMock.mockResolvedValue({ id: "copied-att-1" });

    const result = await copyItemPhoto({
      tripId: TRIP_ID,
      sourcePhotoAttachmentId: "src-att-1",
      targetItemId: "placed-item-1",
    });

    expect(result).toBe("copied-att-1");
    expect(storageCopyMock).toHaveBeenCalledWith(
      `trips/${TRIP_ID}/src-att-old.png`,
      expect.stringMatching(new RegExp(`^trips/${TRIP_ID}/`)),
    );
    // A genuinely new storage key, not the source's.
    const [, destKey] = storageCopyMock.mock.calls[0];
    expect(destKey).not.toBe(`trips/${TRIP_ID}/src-att-old.png`);
    expect(attachmentCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: TRIP_ID,
        targetType: "ITEM",
        targetId: "placed-item-1",
        filename: "old.png",
        mime: "image/png",
        size: 1234,
      }),
    });
    expect(attachmentUpdateMock).toHaveBeenCalledWith({
      where: { id: "copied-att-1" },
      data: { url: "/api/attachments/copied-att-1" },
    });
  });

  it("returns null and creates nothing when the source attachment is gone", async () => {
    attachmentFindUniqueMock.mockResolvedValue(null);

    const result = await copyItemPhoto({
      tripId: TRIP_ID,
      sourcePhotoAttachmentId: "missing-att",
      targetItemId: "placed-item-1",
    });

    expect(result).toBeNull();
    expect(storageCopyMock).not.toHaveBeenCalled();
    expect(attachmentCreateMock).not.toHaveBeenCalled();
  });

  it("returns null and reports the error when storage.copy throws — never a dangling row", async () => {
    attachmentFindUniqueMock.mockResolvedValue({
      storageKey: `trips/${TRIP_ID}/src-att-old.png`,
      filename: "old.png",
      mime: "image/png",
      size: 1234,
      uploadedById: "user-1",
    });
    storageCopyMock.mockRejectedValueOnce(new Error("source object missing"));

    const result = await copyItemPhoto({
      tripId: TRIP_ID,
      sourcePhotoAttachmentId: "src-att-1",
      targetItemId: "placed-item-1",
    });

    expect(result).toBeNull();
    expect(attachmentCreateMock).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledWith(expect.any(Error), {
      route: "server/actions/item-photo.ts#copyItemPhoto",
      source: "server",
    });
  });
});
