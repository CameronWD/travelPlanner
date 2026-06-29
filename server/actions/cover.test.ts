import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

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
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
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

import { setTripCover, removeTripCover } from "./cover";

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

  it("replacing an existing cover deletes the old blob", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: "trips/t1/old" });
    const fd = makeFormData({
      file: new File(["img"], "p.png", { type: "image/png" }),
    });
    await setTripCover(fd);
    expect(storageDeleteMock).toHaveBeenCalledWith("trips/t1/old");
  });
});

// ---------------------------------------------------------------------------
// removeTripCover
// ---------------------------------------------------------------------------

describe("removeTripCover", () => {
  it("deletes the blob and clears coverImageKey in the db", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: "trips/t1/old" });
    const result = await removeTripCover(TRIP_ID);
    expect(result.success).toBe(true);
    expect(storageDeleteMock).toHaveBeenCalledWith("trips/t1/old");
    expect(tripUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TRIP_ID },
        data: expect.objectContaining({ coverImageKey: null }),
      }),
    );
  });

  it("is a no-op success when the trip has no cover", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: null });
    const result = await removeTripCover(TRIP_ID);
    expect(result.success).toBe(true);
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });
});
