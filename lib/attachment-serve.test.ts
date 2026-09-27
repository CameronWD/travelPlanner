import { describe, it, expect, vi, beforeEach } from "vitest";

// serveAttachment (extracted from app/api/attachments/[id]/route.ts, Task 20)
// is exercised end-to-end by app/api/serve-route-caching.test.ts through the
// private route. These tests cover it directly, in particular the
// `cacheControl` override (fix round 1, finding 3) the Journal photo route
// uses to make a revoked/rotated link's photos drop out of a viewer's cache
// sooner than the private route's default.

const { presignDownloadMock, readMock } = vi.hoisted(() => ({
  presignDownloadMock: vi.fn(),
  readMock: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  getStorage: () => ({
    save: vi.fn(),
    delete: vi.fn(),
    read: readMock,
    presignDownload: presignDownloadMock,
  }),
}));

import { serveAttachment } from "./attachment-serve";

const attachment = () => ({
  filename: "photo.jpg",
  mime: "image/jpeg",
  storageKey: "trips/t1/photo.jpg",
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("serveAttachment", () => {
  it("404s (no-store) when there is no storage key", async () => {
    const res = await serveAttachment({ ...attachment(), storageKey: null });
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(presignDownloadMock).not.toHaveBeenCalled();
  });

  it("defaults to 'private, max-age=3600' on the presigned URL's baked-in Cache-Control", async () => {
    presignDownloadMock.mockResolvedValue("https://signed.example/photo.jpg");
    await serveAttachment(attachment());
    expect(presignDownloadMock).toHaveBeenCalledWith(
      "trips/t1/photo.jpg",
      expect.objectContaining({ cacheControl: "private, max-age=3600" }),
    );
  });

  it("passes an overridden cacheControl through to the presign call", async () => {
    presignDownloadMock.mockResolvedValue("https://signed.example/photo.jpg");
    await serveAttachment(attachment(), { cacheControl: "private, max-age=300" });
    expect(presignDownloadMock).toHaveBeenCalledWith(
      "trips/t1/photo.jpg",
      expect.objectContaining({ cacheControl: "private, max-age=300" }),
    );
  });

  it("the presigned redirect itself is always no-store, regardless of the override", async () => {
    presignDownloadMock.mockResolvedValue("https://signed.example/photo.jpg");
    const res = await serveAttachment(attachment(), { cacheControl: "private, max-age=300" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("applies an overridden cacheControl to the streamed-bytes fallback (no presign)", async () => {
    presignDownloadMock.mockResolvedValue(null);
    readMock.mockResolvedValue(Buffer.from("bytes"));
    const res = await serveAttachment(attachment(), { cacheControl: "private, max-age=300" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
  });

  it("defaults the streamed-bytes fallback to 'private, max-age=3600' with no override", async () => {
    presignDownloadMock.mockResolvedValue(null);
    readMock.mockResolvedValue(Buffer.from("bytes"));
    const res = await serveAttachment(attachment());
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
  });

  it("404s (no-store) when the streamed fallback finds nothing in storage", async () => {
    presignDownloadMock.mockResolvedValue(null);
    readMock.mockResolvedValue(null);
    const res = await serveAttachment(attachment());
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
