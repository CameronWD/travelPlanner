import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { requireUserMock, requireTripAccessMock, tripFindUniqueMock, readMock, readStreamMock, presignDownloadMock } =
  vi.hoisted(() => ({
    requireUserMock: vi.fn(),
    requireTripAccessMock: vi.fn(),
    tripFindUniqueMock: vi.fn(),
    readMock: vi.fn(),
    readStreamMock: vi.fn(),
    presignDownloadMock: vi.fn(),
  }));

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock, requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/db", () => ({ db: { trip: { findUnique: tripFindUniqueMock } } }));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({
    save: vi.fn(),
    delete: vi.fn(),
    copy: vi.fn(),
    read: readMock,
    readStream: readStreamMock,
    presignDownload: presignDownloadMock,
  }),
}));

import { GET } from "./route";

function get(query = "") {
  return GET(new NextRequest(`http://test.local/api/trips/t1/cover${query}`), {
    params: Promise.resolve({ tripId: "t1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "u1" });
  requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "member" } });
  tripFindUniqueMock.mockResolvedValue({ coverImageKey: "trips/t1/cover.png", coverSmallKey: "trips/t1/cover.png-sm" });
  presignDownloadMock.mockResolvedValue("https://signed.example/cover.png");
  readStreamMock.mockImplementation(async () => new Response("png-bytes").body);
});

describe("GET /api/trips/:tripId/cover?offline=1 — saved for offline as bytes (spec A2)", () => {
  it("an ordinary request still redirects to storage", async () => {
    const res = await get("?v=k");
    expect(res.status).toBe(302);
  });

  it("?offline=1 serves bytes", async () => {
    const res = await get("?v=k&offline=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Location")).toBeNull();
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(await res.text()).toBe("png-bytes");
    expect(readStreamMock).toHaveBeenCalledWith("trips/t1/cover.png");
    expect(presignDownloadMock).not.toHaveBeenCalled();
  });

  it("?offline=1 serves the small copy's bytes for a small width", async () => {
    const res = await get("?v=k&w=480&offline=1");
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(readStreamMock).toHaveBeenCalledWith("trips/t1/cover.png-sm");
  });

  it("?offline=1 404s (no-store) when storage has nothing under the key", async () => {
    readStreamMock.mockResolvedValue(null);
    const res = await get("?v=k&offline=1");
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("?offline=1 still refuses a non-member", async () => {
    requireTripAccessMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(get("?v=k&offline=1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(tripFindUniqueMock).not.toHaveBeenCalled();
    expect(readStreamMock).not.toHaveBeenCalled();
    expect(presignDownloadMock).not.toHaveBeenCalled();
  });
});
