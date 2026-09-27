import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for `copyItemPhoto` (CONTEXT.md "Item photo", spec §I).
 *
 * This lives in a plain `lib/` module (no "use server") rather than
 * server/actions/item-photo.ts specifically so it can never be exposed as a
 * client-callable Server Action (fix round 1, security) — see the file's own
 * docblock. It performs no auth of its own; it trusts that its callers
 * (`scheduleItem`, `createFork`) have already access-checked `tripId`
 * themselves, and only adds the targetType/tripId check below as defence in
 * depth.
 *
 * Mocks: lib/db, lib/storage (getStorage().copy — generateKey stays real),
 * lib/error-sink.
 */

const {
  attachmentFindUniqueMock,
  attachmentCreateMock,
  attachmentUpdateMock,
  storageCopyMock,
  reportErrorMock,
} = vi.hoisted(() => ({
  attachmentFindUniqueMock: vi.fn(),
  attachmentCreateMock: vi.fn(),
  attachmentUpdateMock: vi.fn().mockResolvedValue({}),
  storageCopyMock: vi.fn().mockResolvedValue(undefined),
  reportErrorMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));
vi.mock("@/lib/storage", async (importOriginal) => {
  // Keep pure helpers (generateKey) real; mock getStorage() for a
  // controlled copy() spy.
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
    attachment: {
      findUnique: attachmentFindUniqueMock,
      create: attachmentCreateMock,
      update: attachmentUpdateMock,
    },
  },
}));

import { copyItemPhoto } from "./item-photo-copy";

const TRIP_ID = "trip-1";
const OTHER_TRIP_ID = "trip-2";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("copyItemPhoto", () => {
  it("copies the storage object to a new key and creates a new ITEM attachment", async () => {
    attachmentFindUniqueMock.mockResolvedValue({
      tripId: TRIP_ID,
      targetType: "ITEM",
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
      tripId: TRIP_ID,
      targetType: "ITEM",
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
      route: "lib/item-photo-copy.ts#copyItemPhoto",
      source: "server",
    });
  });

  // Fix round 1 (Important — security): defence in depth. Even if a caller
  // passed mismatched ids (or the module boundary were somehow bypassed),
  // a source Attachment from a DIFFERENT trip must never be copied in.
  it("refuses a source attachment that belongs to a different trip — never copies cross-trip", async () => {
    attachmentFindUniqueMock.mockResolvedValue({
      tripId: OTHER_TRIP_ID,
      targetType: "ITEM",
      storageKey: `trips/${OTHER_TRIP_ID}/someone-elses-passport.png`,
      filename: "passport.png",
      mime: "image/png",
      size: 999,
      uploadedById: "someone-else",
    });

    const result = await copyItemPhoto({
      tripId: TRIP_ID,
      sourcePhotoAttachmentId: "src-att-in-other-trip",
      targetItemId: "placed-item-1",
    });

    expect(result).toBeNull();
    expect(storageCopyMock).not.toHaveBeenCalled();
    expect(attachmentCreateMock).not.toHaveBeenCalled();
  });

  // Defence in depth's other half: only an ITEM-photo Attachment may ever
  // be copied this way, never e.g. a Journal photo or a Profile photo.
  it("refuses a source attachment whose targetType isn't ITEM", async () => {
    attachmentFindUniqueMock.mockResolvedValue({
      tripId: TRIP_ID,
      targetType: "JOURNAL",
      storageKey: `trips/${TRIP_ID}/journal-photo.png`,
      filename: "journal.png",
      mime: "image/png",
      size: 500,
      uploadedById: "user-1",
    });

    const result = await copyItemPhoto({
      tripId: TRIP_ID,
      sourcePhotoAttachmentId: "src-att-journal",
      targetItemId: "placed-item-1",
    });

    expect(result).toBeNull();
    expect(storageCopyMock).not.toHaveBeenCalled();
    expect(attachmentCreateMock).not.toHaveBeenCalled();
  });
});
