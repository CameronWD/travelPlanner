import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/**
 * Tests for Traveller profile server actions: setDisplayName /
 * setProfilePhoto / removeProfilePhoto (Task 1, CONTEXT.md "Profile photo
 * and display name"). Mocks: lib/db, lib/guards, lib/storage, lib/blob-retention, next/cache.
 */

const {
  requireUserMock,
  revalidatePathMock,
  userFindUniqueMock,
  userUpdateMock,
  storageSaveMock,
  storageDeleteMock,
  scheduleBlobDeletionMock,
  checkQuotaMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn().mockResolvedValue({ id: "u1" }),
  revalidatePathMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  userUpdateMock: vi.fn(),
  storageSaveMock: vi.fn(),
  storageDeleteMock: vi.fn(),
  scheduleBlobDeletionMock: vi.fn().mockResolvedValue(undefined),
  checkQuotaMock: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/blob-retention", () => ({ scheduleBlobDeletion: scheduleBlobDeletionMock }));
vi.mock("@/lib/storage-quota", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage-quota")>()),
  checkQuota: checkQuotaMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: userFindUniqueMock,
      update: userUpdateMock,
    },
  },
}));
vi.mock("@/lib/storage", async (importOriginal) => {
  // Keep pure helpers (generateKey, validateUpload, sanitiseFilename) real;
  // mock getStorage() to return controlled save/delete spies.
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

import {
  setDisplayName,
  setProfilePhoto,
  setProfilePhotoFocal,
  removeProfilePhoto,
} from "./profile";

const USER_ID = "u1";

function makeFormData(overrides: Record<string, string | File> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string | File> = {
    file: new File(["img"], "photo.png", { type: "image/png" }),
  };
  const merged = { ...defaults, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    fd.set(k, v);
  }
  return fd;
}

beforeEach(() => {
  requireUserMock.mockResolvedValue({ id: USER_ID });
  userFindUniqueMock.mockResolvedValue({ photoKey: null });
  userUpdateMock.mockResolvedValue({});
  storageSaveMock.mockResolvedValue(undefined);
  storageDeleteMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// setDisplayName
// ---------------------------------------------------------------------------

describe("setDisplayName", () => {
  it("trims and stores a valid name", async () => {
    const result = await setDisplayName("  Cam  ");
    expect(result.success).toBe(true);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { displayName: "Cam" },
    });
  });

  it("stores null for a blank/whitespace-only name (clears it)", async () => {
    const result = await setDisplayName("   ");
    expect(result.success).toBe(true);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { displayName: null },
    });
  });

  it("rejects a name over 60 characters without writing", async () => {
    const result = await setDisplayName("x".repeat(61));
    expect(result.success).toBe(false);
    expect(userUpdateMock).not.toHaveBeenCalled();
    if (result.success) return;
    expect(result.errors.displayName).toBeDefined();
  });

  it("accepts a name at exactly 60 characters", async () => {
    const result = await setDisplayName("x".repeat(60));
    expect(result.success).toBe(true);
  });

  it("requires a signed-in user before writing", async () => {
    await setDisplayName("Cam");
    expectAccessCheckedBeforeWrite(requireUserMock, userUpdateMock);
  });

  it("revalidates the whole layout (avatar shows everywhere)", async () => {
    await setDisplayName("Cam");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});

// ---------------------------------------------------------------------------
// setProfilePhoto
// ---------------------------------------------------------------------------

describe("setProfilePhoto", () => {
  it("rejects a non-image file (PDF) and does not call storage.save", async () => {
    const fd = makeFormData({
      file: new File(["x"], "x.pdf", { type: "application/pdf" }),
    });
    const result = await setProfilePhoto(fd);
    expect(result.success).toBe(false);
    expect(storageSaveMock).not.toHaveBeenCalled();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects a missing file", async () => {
    const fd = new FormData();
    const result = await setProfilePhoto(fd);
    expect(result.success).toBe(false);
    expect(storageSaveMock).not.toHaveBeenCalled();
  });

  it("saves a PNG to storage under a user-scoped key and updates photoKey + photoUpdatedAt", async () => {
    userFindUniqueMock.mockResolvedValue({ photoKey: null });
    const fd = makeFormData({
      file: new File(["img"], "p.png", { type: "image/png" }),
    });
    const result = await setProfilePhoto(fd);
    expect(result.success).toBe(true);
    expect(storageSaveMock).toHaveBeenCalledOnce();
    expect(userUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({
          photoKey: expect.stringMatching(new RegExp(`^users/${USER_ID}/`)),
          photoUpdatedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("schedules the old photo key for deletion when replacing an existing photo", async () => {
    userFindUniqueMock.mockResolvedValue({ photoKey: "users/u1/old-avatar.png" });
    await setProfilePhoto(makeFormData());
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(["users/u1/old-avatar.png"]);
  });

  it("does not schedule deletion when there was no previous photo", async () => {
    userFindUniqueMock.mockResolvedValue({ photoKey: null });
    await setProfilePhoto(makeFormData());
    expect(scheduleBlobDeletionMock).not.toHaveBeenCalled();
  });

  it("is access-checked before the write", async () => {
    await setProfilePhoto(makeFormData());
    expectAccessCheckedBeforeWrite(requireUserMock, userUpdateMock);
  });

  it("refuses an over-quota upload with the global message and writes nothing", async () => {
    checkQuotaMock.mockResolvedValueOnce({
      ok: false,
      error: "Teepee's file storage is full. Cam has been told.",
    });

    const result = await setProfilePhoto(makeFormData());

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.file?.[0]).toBe("Teepee's file storage is full. Cam has been told.");
    expect(checkQuotaMock).toHaveBeenCalledWith({ tripId: null, size: expect.any(Number) });
    expect(storageSaveMock).not.toHaveBeenCalled();
    expect(userUpdateMock).not.toHaveBeenCalled();
    expectAccessCheckedBeforeWrite(requireUserMock, checkQuotaMock);
  });

  it("does not crop: saves the file bytes as given and resets the focal point to null", async () => {
    const file = new File(["exact-bytes"], "p.jpg", { type: "image/jpeg" });
    await setProfilePhoto(makeFormData({ file }));
    const saved = storageSaveMock.mock.calls[0]!;
    expect(Buffer.isBuffer(saved[1])).toBe(true);
    expect((saved[1] as Buffer).toString()).toBe("exact-bytes");
    expect(saved[2]).toBe("image/jpeg");
    expect(userUpdateMock.mock.calls[0]![0].data).toMatchObject({
      photoFocalX: null,
      photoFocalY: null,
    });
  });

  it("revalidates the whole layout", async () => {
    await setProfilePhoto(makeFormData());
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});

// ---------------------------------------------------------------------------
// setProfilePhotoFocal
// ---------------------------------------------------------------------------

describe("setProfilePhotoFocal", () => {
  it("stores both coordinates for the signed-in Traveller", async () => {
    const result = await setProfilePhotoFocal(0.25, 0.8);
    expect(result.success).toBe(true);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { photoFocalX: 0.25, photoFocalY: 0.8 },
    });
  });

  it("clamps to 0–1 and stores both", async () => {
    await setProfilePhotoFocal(1.7, -0.2);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { photoFocalX: 1, photoFocalY: 0 },
    });
  });

  it("refuses a non-number", async () => {
    for (const [x, y] of [
      [Number.NaN, 0.5],
      [0.5, Number.POSITIVE_INFINITY],
      ["0.5" as unknown as number, 0.5],
    ] as const) {
      const result = await setProfilePhotoFocal(x, y);
      expect(result.success).toBe(false);
    }
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("is access-checked before the write and revalidates the whole layout", async () => {
    await setProfilePhotoFocal(0.5, 0.5);
    expectAccessCheckedBeforeWrite(requireUserMock, userUpdateMock);
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});

// ---------------------------------------------------------------------------
// removeProfilePhoto
// ---------------------------------------------------------------------------

describe("removeProfilePhoto", () => {
  it("schedules the blob for retention and clears photoKey/photoUpdatedAt", async () => {
    userFindUniqueMock.mockResolvedValue({ photoKey: "users/u1/old.png" });
    const result = await removeProfilePhoto();
    expect(result.success).toBe(true);
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(["users/u1/old.png"]);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { photoKey: null, photoUpdatedAt: null, photoFocalX: null, photoFocalY: null },
    });
  });

  it("is a no-op success when there is no photo", async () => {
    userFindUniqueMock.mockResolvedValue({ photoKey: null });
    const result = await removeProfilePhoto();
    expect(result.success).toBe(true);
    expect(scheduleBlobDeletionMock).not.toHaveBeenCalled();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("revalidates the whole layout", async () => {
    userFindUniqueMock.mockResolvedValue({ photoKey: "users/u1/old.png" });
    await removeProfilePhoto();
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});
