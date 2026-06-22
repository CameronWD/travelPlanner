import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for share link server actions.
 *
 * Mocks:
 *   - lib/db        — so we can assert Prisma calls without hitting the database
 *   - lib/guards    — so requireTripAccess returns a predictable result
 *   - next/cache    — so revalidatePath is interceptable
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  shareFindFirstMock,
  shareCreateMock,
  shareUpsertMock,
  shareDeleteManyMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  revalidatePathMock: vi.fn(),
  shareFindFirstMock: vi.fn(),
  shareCreateMock: vi.fn(),
  shareUpsertMock: vi.fn(),
  shareDeleteManyMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/db", () => ({
  db: {
    shareLink: {
      findFirst: shareFindFirstMock,
      create: shareCreateMock,
      upsert: shareUpsertMock,
      deleteMany: shareDeleteManyMock,
    },
  },
}));

import {
  createShareLink,
  rotateShareLink,
  revokeShareLink,
  getShareLink,
} from "./share";

const TRIP_ID = "trip-abc";

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createShareLink
// ---------------------------------------------------------------------------

describe("createShareLink", () => {
  it("is access-checked — calls requireTripAccess with the tripId", async () => {
    shareFindFirstMock.mockResolvedValue(null);
    shareCreateMock.mockResolvedValue({ token: "new-token-1" });

    await createShareLink(TRIP_ID);

    expect(requireTripAccessMock).toHaveBeenCalledOnce();
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("creates a new share link and returns { token } when none exists", async () => {
    shareFindFirstMock.mockResolvedValue(null);
    const token = "generated-uuid";
    shareCreateMock.mockResolvedValue({ token });

    const result = await createShareLink(TRIP_ID);

    expect(shareCreateMock).toHaveBeenCalledOnce();
    expect(shareCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tripId: TRIP_ID }),
      }),
    );
    expect(result).toEqual({ token });
  });

  it("is idempotent — keeps existing token when one already exists", async () => {
    const existingToken = "existing-token";
    shareFindFirstMock.mockResolvedValue({ token: existingToken });

    const result = await createShareLink(TRIP_ID);

    // Should NOT call create when one already exists
    expect(shareCreateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ token: existingToken });
  });

  it("revalidates the settings path after creating", async () => {
    shareFindFirstMock.mockResolvedValue(null);
    shareCreateMock.mockResolvedValue({ token: "tok" });

    await createShareLink(TRIP_ID);

    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/trips/${TRIP_ID}/settings`,
    );
  });

  it("revalidates even when returning existing token", async () => {
    shareFindFirstMock.mockResolvedValue({ token: "existing" });

    await createShareLink(TRIP_ID);

    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/trips/${TRIP_ID}/settings`,
    );
  });
});

// ---------------------------------------------------------------------------
// rotateShareLink
// ---------------------------------------------------------------------------

describe("rotateShareLink", () => {
  it("is access-checked", async () => {
    shareUpsertMock.mockResolvedValue({ token: "new-tok" });

    await rotateShareLink(TRIP_ID);

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("upserts a new token and returns it (works with or without an existing link)", async () => {
    const newToken = "fresh-token";
    shareUpsertMock.mockResolvedValue({ token: newToken });

    const result = await rotateShareLink(TRIP_ID);

    expect(shareUpsertMock).toHaveBeenCalledOnce();
    expect(shareUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: TRIP_ID },
        update: expect.objectContaining({ token: expect.any(String) }),
        create: expect.objectContaining({ tripId: TRIP_ID, token: expect.any(String) }),
      }),
    );
    expect(result).toEqual({ token: newToken });
  });

  it("revalidates the settings path after rotating", async () => {
    shareUpsertMock.mockResolvedValue({ token: "tok" });

    await rotateShareLink(TRIP_ID);

    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/trips/${TRIP_ID}/settings`,
    );
  });
});

// ---------------------------------------------------------------------------
// revokeShareLink
// ---------------------------------------------------------------------------

describe("revokeShareLink", () => {
  it("is access-checked", async () => {
    shareDeleteManyMock.mockResolvedValue({ count: 1 });

    await revokeShareLink(TRIP_ID);

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("deletes the share link for the given tripId (no-op if none)", async () => {
    shareDeleteManyMock.mockResolvedValue({ count: 1 });

    await revokeShareLink(TRIP_ID);

    expect(shareDeleteManyMock).toHaveBeenCalledOnce();
    expect(shareDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID },
    });
  });

  it("revalidates the settings path after revoking", async () => {
    shareDeleteManyMock.mockResolvedValue({ count: 0 });

    await revokeShareLink(TRIP_ID);

    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/trips/${TRIP_ID}/settings`,
    );
  });
});

// ---------------------------------------------------------------------------
// getShareLink
// ---------------------------------------------------------------------------

describe("getShareLink", () => {
  it("is access-checked", async () => {
    shareFindFirstMock.mockResolvedValue(null);

    await getShareLink(TRIP_ID);

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("returns { token } when a share link exists", async () => {
    const token = "existing-token";
    shareFindFirstMock.mockResolvedValue({ token });

    const result = await getShareLink(TRIP_ID);

    expect(result).toEqual({ token });
  });

  it("returns null when no share link exists", async () => {
    shareFindFirstMock.mockResolvedValue(null);

    const result = await getShareLink(TRIP_ID);

    expect(result).toBeNull();
  });
});
