import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Tests for GET /api/avatars/:userId — serves a Traveller's uploaded Profile
 * photo. Mirrors app/api/attachments/[id]/route.ts's auth + presigned-redirect
 * pattern (see app/api/serve-route-caching.test.ts for that shared contract).
 *
 * Access: the requester must be that Traveller, or share a TripMember trip
 * or GlobeMember globe with them (CONTEXT.md "Profile photo and display
 * name": seen only by those who share a Trip or Globe). Never reachable
 * without a session; everyone else gets 404 (never leaks whether the id
 * exists).
 */

const {
  requireUserMock,
  userFindUniqueMock,
  tripMemberFindFirstMock,
  globeMemberFindUniqueMock,
  globeMemberFindFirstMock,
  storageReadMock,
  storagePresignMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  tripMemberFindFirstMock: vi.fn(),
  globeMemberFindUniqueMock: vi.fn(),
  globeMemberFindFirstMock: vi.fn(),
  storageReadMock: vi.fn(),
  storagePresignMock: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: userFindUniqueMock },
    tripMember: { findFirst: tripMemberFindFirstMock },
    globeMember: {
      findUnique: globeMemberFindUniqueMock,
      findFirst: globeMemberFindFirstMock,
    },
  },
}));
vi.mock("@/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...real,
    getStorage: vi.fn(() => ({
      save: vi.fn(),
      delete: vi.fn(),
      read: storageReadMock,
      presignDownload: storagePresignMock,
    })),
  };
});

import { GET } from "./route";

const REQUESTER = "requester-1";
const TARGET = "target-1";

function req() {
  return new NextRequest(`http://test.local/api/avatars/${TARGET}`);
}
function params() {
  return { params: Promise.resolve({ userId: TARGET }) };
}

beforeEach(() => {
  requireUserMock.mockResolvedValue({ id: REQUESTER });
  userFindUniqueMock.mockResolvedValue({ photoKey: "users/target-1/uid-avatar.png" });
  tripMemberFindFirstMock.mockResolvedValue(null);
  globeMemberFindUniqueMock.mockResolvedValue(null);
  globeMemberFindFirstMock.mockResolvedValue(null);
  storageReadMock.mockResolvedValue(Buffer.from("x"));
  storagePresignMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/avatars/:userId", () => {
  it("404s (no-store) when the requester shares no Trip or Globe with the target", async () => {
    const res = await GET(req(), params());
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves the requester's own photo with no share check needed", async () => {
    requireUserMock.mockResolvedValue({ id: TARGET });
    const res = await GET(new NextRequest(`http://test.local/api/avatars/${TARGET}`), {
      params: Promise.resolve({ userId: TARGET }),
    });
    expect(res.status).toBe(200);
    expect(tripMemberFindFirstMock).not.toHaveBeenCalled();
    expect(globeMemberFindUniqueMock).not.toHaveBeenCalled();
  });

  it("302s to a presigned URL when the requester shares a Trip with the target", async () => {
    tripMemberFindFirstMock.mockResolvedValue({ id: "tm1" });
    storagePresignMock.mockResolvedValueOnce(
      "https://acc.r2.cloudflarestorage.com/bucket/users/target-1/uid-avatar.png?X-Amz-Signature=sig",
    );

    const res = await GET(req(), params());

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("X-Amz-Signature=sig");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=240");
    expect(storageReadMock).not.toHaveBeenCalled();
    expect(tripMemberFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: REQUESTER }),
      }),
    );
  });

  // ADR 0067 (Recently deleted): sharing a Trip that's since been
  // soft-deleted must not keep a Profile photo visible — the share check
  // itself excludes it.
  it("excludes a Trip in Recently deleted from the trip-share check", async () => {
    tripMemberFindFirstMock.mockResolvedValue(null);
    await GET(req(), params());
    expect(tripMemberFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          trip: expect.objectContaining({ deletedAt: null }),
        }),
      }),
    );
  });

  it("200s when the requester shares a Globe with the target", async () => {
    globeMemberFindUniqueMock.mockResolvedValue({ globeId: "g1" });
    globeMemberFindFirstMock.mockResolvedValue({ id: "gm1" });

    const res = await GET(req(), params());

    expect(res.status).toBe(200);
    expect(globeMemberFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: TARGET, globeId: "g1" }),
      }),
    );
  });

  it("404s (no-store) when the target user has no photoKey, even for an authorized requester", async () => {
    tripMemberFindFirstMock.mockResolvedValue({ id: "tm1" });
    userFindUniqueMock.mockResolvedValue({ photoKey: null });

    const res = await GET(req(), params());

    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("404s (no-store) when the target user row doesn't exist", async () => {
    tripMemberFindFirstMock.mockResolvedValue({ id: "tm1" });
    userFindUniqueMock.mockResolvedValue(null);

    const res = await GET(req(), params());

    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("falls back to streaming bytes when the storage driver can't presign (local disk)", async () => {
    tripMemberFindFirstMock.mockResolvedValue({ id: "tm1" });
    storagePresignMock.mockResolvedValueOnce(null);

    const res = await GET(req(), params());

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(storageReadMock).toHaveBeenCalledWith("users/target-1/uid-avatar.png");
  });

  it("is never reachable without a session (requireUser runs before any db read)", async () => {
    requireUserMock.mockImplementationOnce(() => {
      throw new Error("redirect to /signin");
    });

    await expect(GET(req(), params())).rejects.toThrow();
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });
});
