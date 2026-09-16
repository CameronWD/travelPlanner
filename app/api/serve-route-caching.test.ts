import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Shared caching-policy tests for the two file-serve routes:
 *   - app/api/trips/[tripId]/cover/route.ts
 *   - app/api/attachments/[id]/route.ts
 *
 * Both routes stream private, member-gated bytes and must never let a 404
 * response be heuristically cached by the browser (RFC 9111 §4.2.2 lists 404
 * among heuristically cacheable statuses). Observed in production: a cover
 * fetched before any upload existed got cached as a 404 by Chrome, and kept
 * showing a broken image after a successful upload until a hard refresh.
 *
 * Every 404 from these routes must carry `Cache-Control: no-store`. The 200
 * path must keep its existing `private, max-age=...` header untouched.
 */

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  requireUserMock,
  requireTripAccessMock,
  requireGlobeAccessMock,
  tripFindUniqueMock,
  attachmentFindUniqueMock,
  storageReadMock,
  storagePresignMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn().mockResolvedValue({ id: "u1" }),
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "u1" },
    membership: { role: "member" },
  }),
  requireGlobeAccessMock: vi.fn().mockResolvedValue({ globe: { id: "g1" } }),
  tripFindUniqueMock: vi.fn(),
  attachmentFindUniqueMock: vi.fn(),
  storageReadMock: vi.fn(),
  // Resolves null by default = a driver without presigning (local disk), so
  // every pre-existing test keeps exercising the streamed-bytes path.
  storagePresignMock: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/guards", () => ({
  requireUser: requireUserMock,
  requireTripAccess: requireTripAccessMock,
}));

vi.mock("@/lib/globe", () => ({
  requireGlobeAccess: requireGlobeAccessMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    trip: {
      findUnique: tripFindUniqueMock,
    },
    attachment: {
      findUnique: attachmentFindUniqueMock,
    },
  },
}));

// Default: presigning unavailable (local-disk behaviour) so the pre-existing
// tests keep exercising the streamed-bytes path; redirect tests override it.
vi.mock("@/lib/storage", async (importOriginal) => {
  // Keep pure helpers real; mock getStorage() to return a controlled read spy.
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

import { GET as coverGET } from "./trips/[tripId]/cover/route";
import { GET as attachmentGET } from "./attachments/[id]/route";

// ---------------------------------------------------------------------------
// Cover route
// ---------------------------------------------------------------------------

describe("GET /api/trips/:tripId/cover — caching policy", () => {
  it("404s with no-store when the trip has no coverImageKey", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: null });

    const res = await coverGET(new NextRequest("http://test.local/api/trips/t1/cover"), {
      params: Promise.resolve({ tripId: "t1" }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("404s with no-store when the cover key is set but storage has no bytes", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: "trips/t1/cover.png" });
    storageReadMock.mockResolvedValue(null);

    const res = await coverGET(new NextRequest("http://test.local/api/trips/t1/cover"), {
      params: Promise.resolve({ tripId: "t1" }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("happy path: 200 keeps the private max-age header", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: "trips/t1/cover.png" });
    storageReadMock.mockResolvedValue(Buffer.from("x"));

    const res = await coverGET(new NextRequest("http://test.local/api/trips/t1/cover"), {
      params: Promise.resolve({ tripId: "t1" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("private");
  });
});

// ---------------------------------------------------------------------------
// Attachments route
// ---------------------------------------------------------------------------

describe("GET /api/attachments/:id — caching policy", () => {
  it("404s with no-store when the attachment doesn't exist in the db", async () => {
    attachmentFindUniqueMock.mockResolvedValue(null);

    const res = await attachmentGET(new NextRequest("http://test.local/api/attachments/a1"), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("404s with no-store when the attachment row has no storageKey (not fully uploaded)", async () => {
    attachmentFindUniqueMock.mockResolvedValue({
      id: "a1",
      tripId: "t1",
      globeId: null,
      filename: "photo.png",
      mime: "image/png",
      storageKey: null,
    });

    const res = await attachmentGET(new NextRequest("http://test.local/api/attachments/a1"), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("404s with no-store when the file is missing from storage", async () => {
    attachmentFindUniqueMock.mockResolvedValue({
      id: "a1",
      tripId: "t1",
      globeId: null,
      filename: "photo.png",
      mime: "image/png",
      storageKey: "attachments/a1/photo.png",
    });
    storageReadMock.mockResolvedValue(null);

    const res = await attachmentGET(new NextRequest("http://test.local/api/attachments/a1"), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("happy path: 200 keeps the private max-age header", async () => {
    attachmentFindUniqueMock.mockResolvedValue({
      id: "a1",
      tripId: "t1",
      globeId: null,
      filename: "photo.png",
      mime: "image/png",
      storageKey: "attachments/a1/photo.png",
    });
    storageReadMock.mockResolvedValue(Buffer.from("x"));

    const res = await attachmentGET(new NextRequest("http://test.local/api/attachments/a1"), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("private");
  });
});

// ---------------------------------------------------------------------------
// Presigned-redirect policy (both routes)
// ---------------------------------------------------------------------------

describe("presigned-redirect policy", () => {
  it("attachment: 302s to the presigned URL with no-store, without reading bytes", async () => {
    attachmentFindUniqueMock.mockResolvedValue({
      id: "a1",
      tripId: "t1",
      globeId: null,
      filename: "itinerary.pdf",
      mime: "application/pdf",
      storageKey: "trips/t1/uid-itinerary.pdf",
    });
    storagePresignMock.mockResolvedValueOnce("https://acc.r2.cloudflarestorage.com/bucket/trips/t1/uid-itinerary.pdf?X-Amz-Signature=sig");
    storageReadMock.mockClear();

    const res = await attachmentGET(new NextRequest("http://test.local/api/attachments/a1"), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("X-Amz-Signature=sig");
    // The redirect must never be cached: its target expires.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    // Bytes must not flow through the function on this path.
    expect(storageReadMock).not.toHaveBeenCalled();
    // The signed URL carries the same headers the streamed path would set.
    expect(storagePresignMock).toHaveBeenCalledWith("trips/t1/uid-itinerary.pdf", {
      expiresIn: 300,
      contentType: "application/pdf",
      contentDisposition: 'inline; filename="itinerary.pdf"',
      cacheControl: "private, max-age=3600",
    });
  });

  it("cover: 302s to the presigned URL with no-store, without reading bytes", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: "trips/t1/cover.webp" });
    storagePresignMock.mockResolvedValueOnce("https://acc.r2.cloudflarestorage.com/bucket/trips/t1/cover.webp?X-Amz-Signature=sig");
    storageReadMock.mockClear();

    const res = await coverGET(new NextRequest("http://test.local/api/trips/t1/cover"), {
      params: Promise.resolve({ tripId: "t1" }),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("X-Amz-Signature=sig");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(storageReadMock).not.toHaveBeenCalled();
    expect(storagePresignMock).toHaveBeenCalledWith("trips/t1/cover.webp", {
      expiresIn: 300,
      contentType: "image/webp",
      cacheControl: "private, max-age=300",
    });
  });
});
