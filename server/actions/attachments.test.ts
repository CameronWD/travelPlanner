import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/**
 * Tests for attachments server actions.
 * Mocks: lib/db, lib/guards, lib/storage, next/cache, next/navigation
 */

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  requireTripAccessMock,
  requireGlobeAccessMock,
  revalidatePathMock,
  notFoundMock,
  attachmentFindUniqueMock,
  attachmentFindFirstMock,
  attachmentCreateMock,
  attachmentUpdateMock,
  attachmentDeleteMock,
  itemFindFirstMock,
  storageSaveMock,
  storageDeleteMock,
  scheduleBlobDeletionMock,
  transactionMock,
  recordActivityMock,
  reportErrorMock,
  loadJournalWindowMock,
  assertQuotaMock,
} = vi.hoisted(() => {
  const attachmentDeleteMock = vi.fn();
  // db.$transaction(cb) — invokes cb with a fake tx whose attachment.delete
  // is the SAME mock as the top-level one, so existing assertions on
  // attachmentDeleteMock keep working whether a call goes through db.* or
  // tx.* (I3, fix round 1: uploadAttachment's cleanup now runs inside a
  // transaction so the row-delete and the blob schedule commit atomically).
  const transactionMock = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = { attachment: { delete: attachmentDeleteMock } };
    return cb(tx);
  });
  return {
    requireTripAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "member" },
    }),
    requireGlobeAccessMock: vi.fn().mockResolvedValue({
      user: { id: "u1" },
      globe: { id: "g1" },
    }),
    revalidatePathMock: vi.fn(),
    notFoundMock: vi.fn(() => {
      throw new Error("NOT_FOUND");
    }),
    attachmentFindUniqueMock: vi.fn(),
    attachmentFindFirstMock: vi.fn().mockResolvedValue(null),
    attachmentCreateMock: vi.fn(),
    attachmentUpdateMock: vi.fn(),
    attachmentDeleteMock,
    itemFindFirstMock: vi.fn(),
    storageSaveMock: vi.fn(),
    storageDeleteMock: vi.fn(),
    scheduleBlobDeletionMock: vi.fn().mockResolvedValue(undefined),
    transactionMock,
    recordActivityMock: vi.fn().mockResolvedValue(undefined),
    reportErrorMock: vi.fn().mockResolvedValue(undefined),
    // Default window: wide open, "today" mid-trip — individual tests narrow
    // it to exercise the refusal path.
    loadJournalWindowMock: vi.fn().mockResolvedValue({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      today: "2026-07-15",
    }),
    assertQuotaMock: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess: requireGlobeAccessMock }));
vi.mock("@/lib/blob-retention", () => ({ scheduleBlobDeletion: scheduleBlobDeletionMock }));
vi.mock("@/server/actions/activity", () => ({ recordActivity: recordActivityMock }));
// loadJournalWindow is lib/journal-window-loader.ts's DB-backed helper for
// computing the Trip's Journal writability window (spec K) — moved off
// server/actions/journal.ts (fix round 2, security: it did no access check
// of its own, so exporting it from a "use server" module exposed it as a
// client-callable Server Action). canWriteJournal itself is a pure function
// from lib/journal-window and is left real.
vi.mock("@/lib/journal-window-loader", () => ({ loadJournalWindow: loadJournalWindowMock }));
// ARCH-OBS-1: the storage-write catch reports to the error sink. Mocked
// entirely here — reportError's own behaviour is lib/error-sink.test.ts's job.
vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));
vi.mock("@/lib/storage-quota", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage-quota")>()),
  assertQuota: assertQuotaMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/db", () => ({
  db: {
    attachment: {
      findUnique: attachmentFindUniqueMock,
      findFirst: attachmentFindFirstMock,
      create: attachmentCreateMock,
      update: attachmentUpdateMock,
      delete: attachmentDeleteMock,
    },
    item: { findFirst: itemFindFirstMock },
    $transaction: transactionMock,
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

import * as attachmentsActions from "./attachments";
import { uploadAttachment, deleteAttachment, setAttachmentTitle, linkAttachmentToItem } from "./attachments";
import { QuotaExceeded } from "@/lib/storage-quota";

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
  attachmentDeleteMock.mockResolvedValue({});
  attachmentFindFirstMock.mockResolvedValue(null);
  storageSaveMock.mockResolvedValue(undefined);
  storageDeleteMock.mockResolvedValue(undefined);
  loadJournalWindowMock.mockResolvedValue({
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    today: "2026-07-15",
  });
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
    expectAccessCheckedBeforeWrite(requireTripAccessMock, attachmentCreateMock);
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

  it("logs a CREATED attachment activity", async () => {
    const fd = makeFormData({ file: new File(["hello"], "boarding.pdf", { type: "application/pdf" }) });
    await uploadAttachment(fd);
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: TRIP_ID,
        verb: "CREATED",
        entityType: "ATTACHMENT",
        changes: { excerpt: "boarding.pdf" },
      }),
    );
  });

  it("refuses an over-quota upload with the Trip message and writes nothing", async () => {
    assertQuotaMock.mockRejectedValueOnce(new QuotaExceeded("trip"));
    const result = await uploadAttachment(makeFormData());
    expect(result).toEqual({
      success: false,
      error: "This Trip has used its 500 MB of file storage. Delete some files to add more.",
    });
    expect(attachmentCreateMock).not.toHaveBeenCalled();
    expect(storageSaveMock).not.toHaveBeenCalled();
  });

  it("checks access before the quota and before reading the file", async () => {
    await uploadAttachment(makeFormData());
    expectAccessCheckedBeforeWrite(requireTripAccessMock, assertQuotaMock);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, storageSaveMock);
  });

  it("passes the global message through for a Globe upload", async () => {
    assertQuotaMock.mockRejectedValueOnce(new QuotaExceeded("global"));
    const fd = new FormData();
    fd.set("globeId", "g1");
    fd.set("targetType", "MARKER");
    fd.set("targetId", "m1");
    fd.set("file", new File(["hello"], "tickets.pdf", { type: "application/pdf" }));
    const result = await uploadAttachment(fd);
    expect(result).toEqual({
      success: false,
      error: "Teepee's file storage is full. Cam has been told.",
    });
    expect(storageSaveMock).not.toHaveBeenCalled();
  });

  it("checks access before the quota for a Globe upload too", async () => {
    const fd = new FormData();
    fd.set("globeId", "g1");
    fd.set("targetType", "MARKER");
    fd.set("targetId", "m1");
    fd.set("file", new File(["hello"], "tickets.pdf", { type: "application/pdf" }));
    await uploadAttachment(fd);
    expectAccessCheckedBeforeWrite(requireGlobeAccessMock, assertQuotaMock);
  });

  it("uploads a globe-scoped attachment to a marker", async () => {
    requireGlobeAccessMock.mockResolvedValue({ user: { id: "u1" }, globe: { id: "g1" } });
    attachmentCreateMock.mockResolvedValue({ id: "at1", globeId: "g1" });
    // Build a FormData without tripId, with globeId instead
    const fd = new FormData();
    fd.set("globeId", "g1");
    fd.set("targetType", "MARKER");
    fd.set("targetId", "m1");
    fd.set("file", new File(["hello"], "tickets.pdf", { type: "application/pdf" }));
    const result = await uploadAttachment(fd);
    expect(result.success).toBe(true);
    expect(requireGlobeAccessMock).toHaveBeenCalled();
    expect(requireTripAccessMock).not.toHaveBeenCalled();
    // storage key is globe-scoped
    expect(storageSaveMock).toHaveBeenCalledWith(expect.stringMatching(/^globes\/g1\//), expect.anything(), expect.any(String));
  });

  describe("storage write failure", () => {
    it("trip path: deletes the placeholder row and reports failure", async () => {
      storageSaveMock.mockRejectedValueOnce(new Error("EROFS: read-only file system"));

      const result = await uploadAttachment(makeFormData());

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toBe("Upload failed — nothing was saved. Please try again.");
      expect(attachmentDeleteMock).toHaveBeenCalledWith({
        where: { id: ATTACHMENT_ID },
      });
      // A partial write is scheduled for retention/sweep (ARCH-DAT-3) rather
      // than destroyed synchronously, keyed the same way the successful path
      // would have been — and inside the SAME db.$transaction as the row
      // delete (I3, fix round 1), so a crash between the two can't happen.
      expect(storageDeleteMock).not.toHaveBeenCalled();
      expect(transactionMock).toHaveBeenCalled();
      expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(
        [`trips/${TRIP_ID}/${ATTACHMENT_ID}-test.pdf`],
        expect.anything(),
      );
      expect(attachmentUpdateMock).not.toHaveBeenCalled();
      expect(recordActivityMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
      // ARCH-OBS-1
      expect(reportErrorMock).toHaveBeenCalledWith(expect.any(Error), {
        route: "server/actions/attachments.ts#uploadAttachment",
        source: "server",
      });
      // I2 (fix round 1): the report must not sit between the failed write
      // and the orphan-row cleanup — a full notifyAdmins round-trip (2.5s
      // per admin device, two DB queries) ahead of a delete-row cleanup
      // means a function that hits its time limit in that window leaves the
      // orphan Attachment row (the cleanup's entire purpose) behind
      // permanently. Cleanup must run, and complete, first.
      expect(attachmentDeleteMock.mock.invocationCallOrder[0]).toBeLessThan(
        reportErrorMock.mock.invocationCallOrder[0],
      );
      expect(scheduleBlobDeletionMock.mock.invocationCallOrder[0]).toBeLessThan(
        reportErrorMock.mock.invocationCallOrder[0],
      );
    });

    it("globe path: deletes the placeholder row and reports failure", async () => {
      storageSaveMock.mockRejectedValueOnce(new Error("EROFS: read-only file system"));

      const result = await uploadAttachment(makeFormData({ globeId: "g1" }));

      expect(result.success).toBe(false);
      expect(attachmentDeleteMock).toHaveBeenCalledWith({
        where: { id: ATTACHMENT_ID },
      });
      expect(storageDeleteMock).not.toHaveBeenCalled();
      expect(transactionMock).toHaveBeenCalled();
      expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(
        [`globes/g1/${ATTACHMENT_ID}-test.pdf`],
        expect.anything(),
      );
      expect(attachmentUpdateMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
      // ARCH-OBS-1
      expect(reportErrorMock).toHaveBeenCalledWith(expect.any(Error), {
        route: "server/actions/attachments.ts#uploadAttachment",
        source: "server",
      });
      // I2 (fix round 1) — see the trip-path test above for the reasoning.
      expect(attachmentDeleteMock.mock.invocationCallOrder[0]).toBeLessThan(
        reportErrorMock.mock.invocationCallOrder[0],
      );
      expect(scheduleBlobDeletionMock.mock.invocationCallOrder[0]).toBeLessThan(
        reportErrorMock.mock.invocationCallOrder[0],
      );
    });

    it("still succeeds when the write works (row-first order preserved)", async () => {
      const result = await uploadAttachment(makeFormData());

      expect(result.success).toBe(true);
      expect(attachmentDeleteMock).not.toHaveBeenCalled();
      // row created before blob written — the id feeds the storage key
      expect(attachmentCreateMock.mock.invocationCallOrder[0]).toBeLessThan(
        storageSaveMock.mock.invocationCallOrder[0],
      );
    });
  });

  // -------------------------------------------------------------------------
  // JOURNAL photos (spec K / ADR 0058): window-checked, one per author per
  // date, second upload replaces the first only with an explicit confirm.
  // -------------------------------------------------------------------------

  describe("JOURNAL uploads", () => {
    function makeJournalFormData(overrides: Record<string, string | File> = {}): FormData {
      return makeFormData({
        targetType: "JOURNAL",
        targetId: "2026-07-15",
        file: new File(["img"], "day.png", { type: "image/png" }),
        ...overrides,
      });
    }

    it("uploads the first photo for the day", async () => {
      const result = await uploadAttachment(makeJournalFormData());
      expect(result).toEqual({ success: true, id: ATTACHMENT_ID });
      expect(attachmentFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tripId: TRIP_ID,
            targetType: "JOURNAL",
            targetId: "2026-07-15",
            uploadedById: "user-1",
          },
        }),
      );
      expect(attachmentCreateMock).toHaveBeenCalled();
    });

    it("is scoped per author — someone else's existing photo for the date doesn't block this upload", async () => {
      // findFirst is scoped to uploadedById in the where clause above; a
      // null result (no row for THIS author) means the flow proceeds.
      attachmentFindFirstMock.mockResolvedValue(null);
      const result = await uploadAttachment(makeJournalFormData());
      expect(result.success).toBe(true);
    });

    it("refuses a second photo for the same author/date without replace", async () => {
      attachmentFindFirstMock.mockResolvedValue({
        id: "old-attach",
        storageKey: "trips/trip-1/old-attach-yesterday.png",
      });
      const result = await uploadAttachment(makeJournalFormData());
      expect(result).toEqual({
        success: false,
        error: "You already have a photo for this day.",
        code: "JOURNAL_PHOTO_EXISTS",
      });
      expect(attachmentCreateMock).not.toHaveBeenCalled();
      expect(attachmentDeleteMock).not.toHaveBeenCalled();
      expect(scheduleBlobDeletionMock).not.toHaveBeenCalled();
    });

    it("replaces the existing photo when replace=1: deletes the old attachment and schedules its blob only after the new one lands", async () => {
      attachmentFindFirstMock.mockResolvedValue({
        id: "old-attach",
        storageKey: "trips/trip-1/old-attach-yesterday.png",
      });
      const result = await uploadAttachment(makeJournalFormData({ replace: "1" }));
      expect(result.success).toBe(true);
      expect(scheduleBlobDeletionMock).toHaveBeenCalledWith([
        "trips/trip-1/old-attach-yesterday.png",
      ]);
      expect(attachmentDeleteMock).toHaveBeenCalledWith({ where: { id: "old-attach" } });
      expect(attachmentCreateMock).toHaveBeenCalled();
      // Fix round 1: the old row/blob must not be touched until the new
      // photo has fully landed — new blob write, then new row update, THEN
      // old-row delete.
      expect(storageSaveMock.mock.invocationCallOrder[0]).toBeLessThan(
        attachmentDeleteMock.mock.invocationCallOrder[0],
      );
      expect(attachmentUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(
        attachmentDeleteMock.mock.invocationCallOrder[0],
      );
    });

    it("fix round 1: does not delete the old photo (or schedule its blob) when the new blob write fails", async () => {
      attachmentFindFirstMock.mockResolvedValue({
        id: "old-attach",
        storageKey: "trips/trip-1/old-attach-yesterday.png",
      });
      storageSaveMock.mockRejectedValueOnce(new Error("EROFS: read-only file system"));

      const result = await uploadAttachment(makeJournalFormData({ replace: "1" }));

      expect(result.success).toBe(false);
      // The old attachment survives untouched...
      expect(attachmentDeleteMock).not.toHaveBeenCalledWith({ where: { id: "old-attach" } });
      expect(scheduleBlobDeletionMock).not.toHaveBeenCalledWith([
        "trips/trip-1/old-attach-yesterday.png",
      ]);
      // ...only the failed placeholder row's own cleanup ran (existing
      // storage-write-failure behaviour, unaffected by the JOURNAL path).
      expect(attachmentDeleteMock).toHaveBeenCalledWith({ where: { id: ATTACHMENT_ID } });
    });

    it("refuses a date the Journal isn't open for yet", async () => {
      loadJournalWindowMock.mockResolvedValue({
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        today: "2026-07-10",
      });
      const result = await uploadAttachment(makeJournalFormData({ targetId: "2026-07-15" }));
      expect(result.success).toBe(false);
      expect(attachmentCreateMock).not.toHaveBeenCalled();
      expect(attachmentFindFirstMock).not.toHaveBeenCalled();
    });

    it("refuses a missing targetId", async () => {
      const fd = makeFormData({
        targetType: "JOURNAL",
        file: new File(["img"], "day.png", { type: "image/png" }),
      });
      const result = await uploadAttachment(fd);
      expect(result.success).toBe(false);
      expect(attachmentCreateMock).not.toHaveBeenCalled();
    });

    it("refuses a malformed targetId", async () => {
      const result = await uploadAttachment(makeJournalFormData({ targetId: "not-a-date" }));
      expect(result.success).toBe(false);
      expect(attachmentCreateMock).not.toHaveBeenCalled();
    });

    // Final review #11: a Journal photo is a photo — any other allowed
    // upload type (PDF etc.) is refused server-side for JOURNAL.
    it("refuses a non-image file for a Journal photo", async () => {
      const result = await uploadAttachment(
        makeJournalFormData({ file: new File(["%PDF"], "ticket.pdf", { type: "application/pdf" }) }),
      );
      expect(result.success).toBe(false);
      expect(attachmentCreateMock).not.toHaveBeenCalled();
      expect(storageSaveMock).not.toHaveBeenCalled();
    });
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
    expectAccessCheckedBeforeWrite(requireTripAccessMock, attachmentDeleteMock);
  });

  it("schedules the blob for retention instead of destroying it (ARCH-DAT-3)", async () => {
    const row = makeAttachmentRow();
    attachmentFindUniqueMock.mockResolvedValue(row);
    await deleteAttachment(ATTACHMENT_ID);
    expect(storageDeleteMock).not.toHaveBeenCalled();
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith([row.storageKey]);
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

  it("still deletes the row even when scheduling the blob for retention fails", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    scheduleBlobDeletionMock.mockRejectedValueOnce(new Error("db down"));
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

  // Final review #7: a Journal photo is its author's own (spec K) — a
  // co-Traveller can't remove it, though membership alone would allow it.
  it("refuses to delete another Traveller's Journal photo", async () => {
    attachmentFindUniqueMock.mockResolvedValue(
      makeAttachmentRow({ targetType: "JOURNAL", targetId: "2026-07-15", uploadedById: "someone-else" }),
    );
    const result = await deleteAttachment(ATTACHMENT_ID);
    expect(result.success).toBe(false);
    expect(attachmentDeleteMock).not.toHaveBeenCalled();
    expect(scheduleBlobDeletionMock).not.toHaveBeenCalled();
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("lets the author delete their own Journal photo", async () => {
    attachmentFindUniqueMock.mockResolvedValue(
      makeAttachmentRow({ targetType: "JOURNAL", targetId: "2026-07-15", uploadedById: "user-1" }),
    );
    const result = await deleteAttachment(ATTACHMENT_ID);
    expect(result).toEqual({ success: true });
    expect(attachmentDeleteMock).toHaveBeenCalledWith({ where: { id: ATTACHMENT_ID } });
  });

  it("still lets any member delete a non-Journal attachment someone else uploaded", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow({ uploadedById: "someone-else" }));
    const result = await deleteAttachment(ATTACHMENT_ID);
    expect(result).toEqual({ success: true });
  });

  it("passes a null storageKey through to scheduleBlobDeletion (which no-ops on it) rather than calling storage.delete", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow({ storageKey: null }));
    const result = await deleteAttachment(ATTACHMENT_ID);
    expect(storageDeleteMock).not.toHaveBeenCalled();
    // Minor (fix round 1): this used to be vacuous — storage.delete is never
    // called by deleteAttachment any more regardless of storageKey, so
    // asserting only "not called" wouldn't catch a revert to the old
    // direct-storage.delete implementation. Assert scheduleBlobDeletion WAS
    // reached (its own null-filtering is lib/blob-retention.test.ts's job).
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith([null]);
    expect(result).toEqual({ success: true });
  });

  it("logs a DELETED attachment activity", async () => {
    const row = makeAttachmentRow({ filename: "boarding.pdf" });
    attachmentFindUniqueMock.mockResolvedValue(row);
    await deleteAttachment(ATTACHMENT_ID);
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: TRIP_ID,
        verb: "DELETED",
        entityType: "ATTACHMENT",
        changes: { excerpt: "boarding.pdf" },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// createAttachmentFromFile — moved OFF this module (fix round 2, security)
// ---------------------------------------------------------------------------
//
// Every export of a "use server" module (this file has that directive at
// its top) becomes a callable Server Action, whether or not any client code
// imports it. createAttachmentFromFile took a caller-chosen tripId,
// targetType, targetId and userId with no auth of its own — it trusted
// already-access-checked callers (uploadAttachment above,
// server/actions/item-photo.ts setItemPhoto) — so leaving it exported here
// would have let a client upload an arbitrary file into any trip under any
// uploadedById. It now lives in lib/attachment-create.ts, a plain module
// with no "use server" directive, unreachable from the client at all. Its
// own behaviour stays covered indirectly by this file's uploadAttachment
// tests above (which exercise the real function, only its db/storage/
// error-sink dependencies are mocked).
describe("createAttachmentFromFile is NOT exported from this 'use server' module", () => {
  it("guards against it coming back as a Server Action", () => {
    expect((attachmentsActions as Record<string, unknown>).createAttachmentFromFile).toBeUndefined();
  });
});

describe("setAttachmentTitle", () => {
  it("checks access first, trims, and writes the title", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    const result = await setAttachmentTitle(ATTACHMENT_ID, "  Hotel voucher ");
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, attachmentUpdateMock);
    expect(attachmentUpdateMock).toHaveBeenCalledWith({ where: { id: ATTACHMENT_ID }, data: { title: "Hotel voucher" } });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/files`);
    expect(result).toEqual({ success: true });
  });

  it("an empty title clears it", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    await setAttachmentTitle(ATTACHMENT_ID, "   ");
    expect(attachmentUpdateMock).toHaveBeenCalledWith({ where: { id: ATTACHMENT_ID }, data: { title: null } });
  });

  it("refuses a title over 120 characters without writing", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    const result = await setAttachmentTitle(ATTACHMENT_ID, "x".repeat(121));
    expect(result).toEqual({ success: false, error: "Title must be 120 characters or fewer." });
    expect(attachmentUpdateMock).not.toHaveBeenCalled();
  });
});

describe("linkAttachmentToItem", () => {
  it("links a Trip-level file to an Item on the same trip", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    itemFindFirstMock.mockResolvedValue({ id: "item-1" });
    const result = await linkAttachmentToItem(ATTACHMENT_ID, "item-1");
    expect(itemFindFirstMock).toHaveBeenCalledWith({ where: { id: "item-1", tripId: TRIP_ID }, select: { id: true } });
    expect(attachmentUpdateMock).toHaveBeenCalledWith({ where: { id: ATTACHMENT_ID }, data: { targetType: "ITEM", targetId: "item-1" } });
    expect(result).toEqual({ success: true });
  });

  it("refuses an Item that is not on this trip, writing nothing", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    itemFindFirstMock.mockResolvedValue(null);
    const result = await linkAttachmentToItem(ATTACHMENT_ID, "other-trip-item");
    expect(result).toEqual({ success: false, error: "That Item isn't on this Trip." });
    expect(attachmentUpdateMock).not.toHaveBeenCalled();
  });

  it("null unlinks back to Trip-level", async () => {
    attachmentFindUniqueMock.mockResolvedValue({ ...makeAttachmentRow(), targetType: "ITEM", targetId: "item-1" });
    await linkAttachmentToItem(ATTACHMENT_ID, null);
    expect(attachmentUpdateMock).toHaveBeenCalledWith({ where: { id: ATTACHMENT_ID }, data: { targetType: "TRIP", targetId: null } });
  });

  it("refuses a file uploaded on a Stop, Transport or Accommodation", async () => {
    attachmentFindUniqueMock.mockResolvedValue({ ...makeAttachmentRow(), targetType: "STOP", targetId: "s1" });
    const result = await linkAttachmentToItem(ATTACHMENT_ID, "item-1");
    expect(result).toEqual({ success: false, error: "Only Trip-level files can be linked to an Item." });
    expect(attachmentUpdateMock).not.toHaveBeenCalled();
  });

  it("checks access before any write", async () => {
    attachmentFindUniqueMock.mockResolvedValue(makeAttachmentRow());
    itemFindFirstMock.mockResolvedValue({ id: "item-1" });
    await linkAttachmentToItem(ATTACHMENT_ID, "item-1");
    expectAccessCheckedBeforeWrite(requireTripAccessMock, attachmentUpdateMock);
  });
});
