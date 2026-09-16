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

vi.mock("@/lib/storage", async (importOriginal) => {
  // Keep pure helpers real; mock getStorage() to return a controlled read spy.
  const real = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...real,
    getStorage: vi.fn(() => ({
      save: vi.fn(),
      delete: vi.fn(),
      read: storageReadMock,
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
