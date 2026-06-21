import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for attachments server actions.
 * Mocks: lib/db, lib/guards, lib/storage, next/cache, next/navigation
 */

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  requireTripAccessMock,
  revalidatePathMock,
  notFoundMock,
  attachmentFindUniqueMock,
  attachmentCreateMock,
  attachmentUpdateMock,
  attachmentDeleteMock,
  storageSaveMock,
  storageDeleteMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "member" },
  }),
  revalidatePathMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  attachmentFindUniqueMock: vi.fn(),
  attachmentCreateMock: vi.fn(),
  attachmentUpdateMock: vi.fn(),
  attachmentDeleteMock: vi.fn(),
  storageSaveMock: vi.fn(),
  storageDeleteMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/db", () => ({
  db: {
    attachment: {
      findUnique: attachmentFindUniqueMock,
      create: attachmentCreateMock,
      update: attachmentUpdateMock,
      delete: attachmentDeleteMock,
    },
  },
}));
vi.mock("@/lib/storage", async (importOriginal) => {
  // Keep pure helpers (generateKey, validateUpload, sanitiseFilename) real;
  // mock getStorage() to return controlled save/delete/read spies.
  const real = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...real,
    getStorage: vi.fn(() => ({
      save: storageSaveMock,
      delete: storageDeleteMock,
      read: vi.fn().mockResolvedValue(null),
    })),
  };
});

import { uploadAttachment, deleteAttachment } from "./attachments";

const TRIP_ID = "trip-1";
const ATTACHMENT_ID = "attach-1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormData(overrides: Record<string, string | File> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string | File> = {
    tripId: TRIP_ID,
    targetType: "TRIP",
    file: new File(["hello"], "test.pdf", { type: "application/pdf" }),
  };
  const merged = { ...defaults, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    fd.set(k, v);
  }
  return fd;
}

function makeAttachmentRow(overrides: Partial<{
  id: string;
  tripId: string;
  storageKey: string | null;
  filename: string;
  mime: string;
  size: number;
  url: string;
  targetType: string;
  targetId: string | null;
  uploadedById: string;
  createdAt: Date;
}> = {}) {
  return {
    id: ATTACHMENT_ID,
    tripId: TRIP_ID,
    storageKey: "trips/trip-1/attach-1-test.pdf",
    filename: "test.pdf",
    mime: "application/pdf",
    size: 1024,
    url: `/api/attachments/${ATTACHMENT_ID}`,
    targetType: "TRIP",
    targetId: null,
    uploadedById: "user-1",
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "member" },
  });
  attachmentCreateMock.mockResolvedValue({ id: ATTACHMENT_ID });
  attachmentUpdateMock.mockResolvedValue({});
  storageSaveMock.mockResolvedValue(undefined);
  storageDeleteMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// uploadAttachment
// ---------------------------------------------------------------------------

describe("uploadAttachment", () => {
  it("calls requireTripAccess with the tripId", async () => {
    await uploadAttachment(makeFormData());
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("creates an attachment row in the db", async () => {
    await uploadAttachment(makeFormData());
    expect(attachmentCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tripId: TRIP_ID,
          uploadedById: "user-1",
          mime: "application/pdf",
          filename: "test.pdf",
        }),
      }),
    );
  });

  it("calls storage.save with the generated key", async () => {
    await uploadAttachment(makeFormData());
    expect(storageSaveMock).toHaveBeenCalled();
    const [key, , mime] = storageSaveMock.mock.calls[0] as [string, Buffer, string];
    expect(key).toMatch(/^trips\/trip-1\//);
    expect(mime).toBe("application/pdf");
  });

  it("updates the row with the public url and storageKey", async () => {
    await uploadAttachment(makeFormData());
    expect(attachmentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ATTACHMENT_ID },
        data: expect.objectContaining({
          url: `/api/attachments/${ATTACHMENT_ID}`,
          storageKey: expect.stringContaining("trips/trip-1/"),
        }),
      }),
    );
  });

  it("returns { success: true, id } on success", async () => {
    const result = await uploadAttachment(makeFormData());
    expect(result).toEqual({ success: true, id: ATTACHMENT_ID });
  });

  it("revalidates the files path", async () => {
    await uploadAttachment(makeFormData());
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/files`);
  });

  it("rejects an oversize file without saving", async () => {
    const bigFile = new File(
      [new ArrayBuffer(11 * 1024 * 1024)],
      "big.png",
      { type: "image/png" },
    );
    const fd = makeFormData({ file: bigFile });
    const result = await uploadAttachment(fd);
    expect(result.success).toBe(false);
    expect(storageSaveMock).not.toHaveBeenCalled();
    expect(attachmentCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a disallowed MIME type without saving", async () => {
    const zipFile = new File(["zip"], "archive.zip", { type: "application/zip" });
    const fd = makeFormData({ file: zipFile });
    const result = await uploadAttachment(fd);
    expect(result.success).toBe(false);
    expect(storageSaveMock).not.toHaveBeenCalled();
    expect(attachmentCreateMock).not.toHaveBeenCalled();
  });

  it("returns an error when no file is provided", async () => {
    const fd = new FormData();
    fd.set("tripId", TRIP_ID);
    fd.set("targetType", "TRIP");
    const result = await uploadAttachment(fd);
    expect(result.success).toBe(false);
  });

  it("returns an error for an invalid targetType", async () => {
    const fd = makeFormData({ targetType: "BOGUS" });
    const result = await uploadAttachment(fd);
    expect(result.success).toBe(false);
    // Should not hit the db
    expect(attachmentCreateMock).not.toHaveBeenCalled();
  });

  it("is access-checked — throws when user is not a trip member", async () => {
    requireTripAccessMock.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(uploadAttachment(makeFormData())).rejects.toThrow("NOT_FOUND");
    expect(storageSaveMock).not.toHaveBeenCalled();
  });

  it("passes targetId to the db when provided", async () => {
    const fd = makeFormData({ targetType: "STOP", targetId: "stop-99" });
    await uploadAttachment(fd);
    expect(attachmentCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ targetId: "stop-99" }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// deleteAttachment
// ---------------------------------------------------------------------------

describe("deleteAttachment", () => {
  it("looks up the attachment by id", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    await deleteAttachment(ATTACHMENT_ID);
    expect(attachmentFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ATTACHMENT_ID } }),
    );
  });

  it("calls requireTripAccess on the attachment's tripId", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    await deleteAttachment(ATTACHMENT_ID);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("calls storage.delete with the storageKey", async () => {
    const row = makeAttachmentRow();
    attachmentFindUniqueMock.mockResolvedValue(row);
    await deleteAttachment(ATTACHMENT_ID);
    expect(storageDeleteMock).toHaveBeenCalledWith(row.storageKey);
  });

  it("deletes the attachment row from the db", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    const result = await deleteAttachment(ATTACHMENT_ID);
    expect(attachmentDeleteMock).toHaveBeenCalledWith({ where: { id: ATTACHMENT_ID } });
    expect(result).toEqual({ success: true });
  });

  it("revalidates the files path after deletion", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    await deleteAttachment(ATTACHMENT_ID);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/files`);
  });

  it("throws notFound when the attachment does not exist", async () => {
    attachmentFindUniqueMock.mockResolvedValue(null);
    await expect(deleteAttachment(ATTACHMENT_ID)).rejects.toThrow("NOT_FOUND");
    expect(attachmentDeleteMock).not.toHaveBeenCalled();
  });

  it("still deletes the row even when storage.delete throws", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    storageDeleteMock.mockRejectedValue(new Error("blob gone"));
    const result = await deleteAttachment(ATTACHMENT_ID);
    expect(result).toEqual({ success: true });
    expect(attachmentDeleteMock).toHaveBeenCalled();
  });

  it("is access-checked — throws when user is not a trip member", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    requireTripAccessMock.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(deleteAttachment(ATTACHMENT_ID)).rejects.toThrow("NOT_FOUND");
    expect(attachmentDeleteMock).not.toHaveBeenCalled();
  });

  it("skips storage.delete when storageKey is null", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow({ storageKey: null }));
    const result = await deleteAttachment(ATTACHMENT_ID);
    expect(storageDeleteMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });
});
