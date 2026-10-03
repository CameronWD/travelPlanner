import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/**
 * Tests for the Item photo server actions (CONTEXT.md "Item photo", spec §I).
 * Mocks: lib/db, lib/guards, lib/storage, lib/blob-retention, lib/error-sink,
 * next/cache, next/navigation, lib/attachment-create (createAttachmentFromFile).
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
  checkQuotaMock,
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
  checkQuotaMock: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/blob-retention", () => ({ scheduleBlobDeletion: scheduleBlobDeletionMock }));
vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));
vi.mock("@/lib/attachment-create", () => ({
  createAttachmentFromFile: createAttachmentFromFileMock,
}));
vi.mock("@/lib/storage-quota", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage-quota")>()),
  checkQuota: checkQuotaMock,
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

import * as itemPhotoActions from "./item-photo";
import { setItemPhoto, removeItemPhoto } from "./item-photo";

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

  it("refuses an over-quota upload with the Trip message and writes nothing", async () => {
    checkQuotaMock.mockResolvedValueOnce({
      ok: false,
      error: "This Trip has used its 500 MB of file storage. Delete some files to add more.",
    });
    const result = await setItemPhoto(makeFormData());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.file?.[0]).toBe(
      "This Trip has used its 500 MB of file storage. Delete some files to add more.",
    );
    expect(checkQuotaMock).toHaveBeenCalledWith({ tripId: TRIP_ID, size: expect.any(Number) });
    expect(createAttachmentFromFileMock).not.toHaveBeenCalled();
    expect(itemUpdateMock).not.toHaveBeenCalled();
    expectAccessCheckedBeforeWrite(requireTripAccessMock, checkQuotaMock);
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
// copyItemPhoto — moved OFF this module (fix round 1, security)
// ---------------------------------------------------------------------------
//
// Every export of a "use server" module (this file has that directive at
// its top) becomes a callable Server Action with its own action id, whether
// or not any client code imports it. copyItemPhoto does no auth/ownership
// check of its own — it trusts an already-access-checked caller
// (scheduleItem / createFork) — so leaving it here meant any client holding
// its action id could copy ANY Attachment (another Trip's passport scan,
// say) into a Trip/Item of its own choosing. It now lives in
// lib/item-photo-copy.ts, a plain module with no "use server" directive, so
// it is unreachable from the client at all — only server code that imports
// it directly can call it. Its own behaviour is covered by
// lib/item-photo-copy.test.ts.
describe("copyItemPhoto is NOT exported from this 'use server' module", () => {
  it("guards against it coming back as a Server Action", () => {
    expect((itemPhotoActions as Record<string, unknown>).copyItemPhoto).toBeUndefined();
  });
});
