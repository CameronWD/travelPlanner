import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/** Build a minimal valid PNG's bytes with the given pixel dimensions (just
 *  enough for readImageSize's IHDR-chunk parser — see lib/image-size.test.ts).
 *  No explicit return type: `new Uint8Array(n)` infers `Uint8Array<ArrayBuffer>`,
 *  a valid BlobPart for the File constructor below; annotating it as the
 *  bare `Uint8Array` widens to `Uint8Array<ArrayBufferLike>`, which isn't. */
function pngBytes(width: number, height: number) {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

/**
 * Tests for cover storage server actions: setTripCover / removeTripCover.
 * Mocks: lib/db, lib/guards, lib/storage, next/cache
 */

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  requireTripAccessMock,
  revalidatePathMock,
  tripFindUniqueMock,
  tripUpdateMock,
  storageSaveMock,
  storageDeleteMock,
  storageReadMock,
  scheduleBlobDeletionMock,
  reportErrorMock,
  assertQuotaMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "u1" },
    membership: { role: "member" },
  }),
  revalidatePathMock: vi.fn(),
  tripFindUniqueMock: vi.fn(),
  tripUpdateMock: vi.fn(),
  storageSaveMock: vi.fn(),
  storageDeleteMock: vi.fn(),
  storageReadMock: vi.fn().mockResolvedValue(null),
  scheduleBlobDeletionMock: vi.fn().mockResolvedValue(undefined),
  reportErrorMock: vi.fn().mockResolvedValue(undefined),
  assertQuotaMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/blob-retention", () => ({ scheduleBlobDeletion: scheduleBlobDeletionMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
// ARCH-OBS-1: the storage-write catch reports to the error sink. Mocked
// entirely here — reportError's own behaviour is lib/error-sink.test.ts's job.
vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));
vi.mock("@/lib/storage-quota", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage-quota")>()),
  assertQuota: assertQuotaMock,
}));
vi.mock("@/lib/db", () => ({
  db: {
    trip: {
      findUnique: tripFindUniqueMock,
      update: tripUpdateMock,
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
      read: storageReadMock,
    })),
  };
});

import { setTripCover, removeTripCover, setCoverFocal } from "./cover";
import { QuotaExceeded } from "@/lib/storage-quota";

const TRIP_ID = "t1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormData(overrides: Record<string, string | File> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string | File> = {
    tripId: TRIP_ID,
    file: new File(["img"], "photo.png", { type: "image/png" }),
  };
  const merged = { ...defaults, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    fd.set(k, v);
  }
  return fd;
}

beforeEach(() => {
  requireTripAccessMock.mockResolvedValue({
    user: { id: "u1" },
    membership: { role: "member" },
  });
  tripFindUniqueMock.mockResolvedValue({ coverImageKey: null });
  tripUpdateMock.mockResolvedValue({});
  storageSaveMock.mockResolvedValue(undefined);
  storageDeleteMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// setTripCover
// ---------------------------------------------------------------------------

describe("setTripCover", () => {
  it("rejects a non-image mime and does not call storage.save", async () => {
    const fd = makeFormData({
      file: new File(["x"], "x.pdf", { type: "application/pdf" }),
    });
    const result = await setTripCover(fd);
    expect(result.success).toBe(false);
    expect(storageSaveMock).not.toHaveBeenCalled();
  });

  it("rejects a missing file with an error mentioning 'file'", async () => {
    const fd = new FormData();
    fd.set("tripId", TRIP_ID);
    const result = await setTripCover(fd);
    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/file/i);
    expect(storageSaveMock).not.toHaveBeenCalled();
  });

  it("happy path: saves the blob and updates the db coverImageKey", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: null });
    const fd = makeFormData({
      tripId: TRIP_ID,
      file: new File(["img"], "p.png", { type: "image/png" }),
    });
    const result = await setTripCover(fd);
    expect(result.success).toBe(true);
    expect(storageSaveMock).toHaveBeenCalledOnce();
    expect(tripUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TRIP_ID },
        data: expect.objectContaining({
          coverImageKey: expect.stringMatching(new RegExp(`^trips/${TRIP_ID}/`)),
        }),
      }),
    );
  });

  it("stores the cover's aspect ratio (width/height) on the trip (spec F)", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: null });
    const fd = makeFormData({
      tripId: TRIP_ID,
      file: new File([pngBytes(300, 400)], "p.png", { type: "image/png" }),
    });
    const result = await setTripCover(fd);
    expect(result.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TRIP_ID },
        data: expect.objectContaining({ coverAspect: 0.75 }),
      }),
    );
  });

  it("stores a null coverAspect when the uploaded bytes' dimensions can't be read", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: null });
    const fd = makeFormData({
      tripId: TRIP_ID,
      file: new File(["not a real image"], "p.png", { type: "image/png" }),
    });
    const result = await setTripCover(fd);
    expect(result.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ coverAspect: null }),
      }),
    );
  });

  it("resets the focal point when a new cover is uploaded", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: "trips/t1/old" });
    await setTripCover(makeFormData());
    expect(tripUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ coverFocalX: null, coverFocalY: null }),
      }),
    );
  });

  it("replacing an existing cover schedules the old blob for retention (ARCH-DAT-3)", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: "trips/t1/old" });
    const fd = makeFormData({
      file: new File(["img"], "p.png", { type: "image/png" }),
    });
    await setTripCover(fd);
    expect(storageDeleteMock).not.toHaveBeenCalled();
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(["trips/t1/old"]);
  });

  it("returns a friendly failure and leaves the trip untouched when the blob write fails", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: null });
    storageSaveMock.mockRejectedValueOnce(new Error("EROFS: read-only file system"));

    const result = await setTripCover(makeFormData());

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Upload failed — nothing was saved. Please try again.");
    expect(tripUpdateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    // ARCH-OBS-1
    expect(reportErrorMock).toHaveBeenCalledWith(expect.any(Error), {
      route: "server/actions/cover.ts#setTripCover",
      source: "server",
    });
  });

  it("is access-checked before the write", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: null });

    await setTripCover(makeFormData());

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, tripUpdateMock);
  });

  it("refuses an over-quota upload with the global message and writes nothing", async () => {
    assertQuotaMock.mockRejectedValueOnce(new QuotaExceeded("global"));

    const result = await setTripCover(makeFormData());

    expect(result).toEqual({
      success: false,
      error: "Teepee's file storage is full. Cam has been told.",
    });
    expect(assertQuotaMock).toHaveBeenCalledWith({ tripId: null, size: expect.any(Number) });
    expect(storageSaveMock).not.toHaveBeenCalled();
    expect(tripUpdateMock).not.toHaveBeenCalled();
    expectAccessCheckedBeforeWrite(requireTripAccessMock, assertQuotaMock);
  });
});

// ---------------------------------------------------------------------------
// removeTripCover
// ---------------------------------------------------------------------------

describe("removeTripCover", () => {
  it("schedules the blob for retention (ARCH-DAT-3) and clears coverImageKey in the db", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: "trips/t1/old" });
    const result = await removeTripCover(TRIP_ID);
    expect(result.success).toBe(true);
    expect(storageDeleteMock).not.toHaveBeenCalled();
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(["trips/t1/old"]);
    expect(tripUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TRIP_ID },
        data: expect.objectContaining({ coverImageKey: null }),
      }),
    );
  });

  it("resets the focal point when the cover is removed", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: "trips/t1/old" });
    await removeTripCover(TRIP_ID);
    expect(tripUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TRIP_ID },
        data: { coverImageKey: null, coverFocalX: null, coverFocalY: null, coverAspect: null },
      }),
    );
  });

  it("is a no-op success when the trip has no cover", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: null });
    const result = await removeTripCover(TRIP_ID);
    expect(result.success).toBe(true);
    expect(storageDeleteMock).not.toHaveBeenCalled();
    expect(scheduleBlobDeletionMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setCoverFocal (spec E2)
// ---------------------------------------------------------------------------

describe("setCoverFocal", () => {
  it("stores the focal point on the Trip after the access check", async () => {
    const result = await setCoverFocal(TRIP_ID, 0.25, 0.75);
    expect(result.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledWith({
      where: { id: TRIP_ID },
      data: { coverFocalX: 0.25, coverFocalY: 0.75 },
    });
    expectAccessCheckedBeforeWrite(requireTripAccessMock, tripUpdateMock);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}`);
  });

  it("clamps a point outside the photo to its edge", async () => {
    await setCoverFocal(TRIP_ID, -0.2, 1.4);
    expect(tripUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { coverFocalX: 0, coverFocalY: 1 } }),
    );
  });

  it("rejects a non-number without writing", async () => {
    const result = await setCoverFocal(TRIP_ID, Number.NaN, 0.5);
    expect(result.success).toBe(false);
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });
});
