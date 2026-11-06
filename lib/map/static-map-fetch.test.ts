import { describe, it, expect, vi, beforeEach } from "vitest";

const { serverKeyMock, quotaMock } = vi.hoisted(() => ({ serverKeyMock: vi.fn(), quotaMock: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/google-fetch", () => ({ serverKey: serverKeyMock, GOOGLE_TIMEOUT_MS: 5000 }));
vi.mock("@/lib/google-usage", () => ({ takeGoogleQuota: quotaMock }));

import { fetchStaticMapDataUrl } from "./static-map-fetch";

const input = {
  mapId: "MAP",
  width: 280,
  height: 373,
  stops: [{ id: "a", lat: 1, lng: 2, sortOrder: 0 }],
  home: null,
  showReturn: false,
};
const fetchMock = vi.fn();

function image(status = 200, type = "image/png") {
  return new Response(new Uint8Array([1, 2, 3]), { status, headers: { "content-type": type } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  serverKeyMock.mockReturnValue("SRV");
  quotaMock.mockResolvedValue(true);
  fetchMock.mockResolvedValue(image());
});

describe("fetchStaticMapDataUrl", () => {
  it("is null without a server key, and never fetches", async () => {
    serverKeyMock.mockReturnValue(null);
    expect(await fetchStaticMapDataUrl(input)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is null with no located Stop, and takes no quota", async () => {
    expect(await fetchStaticMapDataUrl({ ...input, stops: [{ id: "a", lat: null, lng: null, sortOrder: 0 }] })).toBeNull();
    expect(quotaMock).not.toHaveBeenCalled();
  });

  it("is null when the quota refuses", async () => {
    quotaMock.mockResolvedValue(false);
    expect(await fetchStaticMapDataUrl(input)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is null on a non-200", async () => {
    fetchMock.mockResolvedValue(image(403));
    expect(await fetchStaticMapDataUrl(input)).toBeNull();
  });

  it("is null on a non-image content type", async () => {
    fetchMock.mockResolvedValue(image(200, "text/html"));
    expect(await fetchStaticMapDataUrl(input)).toBeNull();
  });

  it("is null when the fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect(await fetchStaticMapDataUrl(input)).toBeNull();
  });

  it("returns a data URL, requesting the server key at scale 2", async () => {
    expect(await fetchStaticMapDataUrl(input)).toBe("data:image/png;base64,AQID");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("key=SRV");
    expect(url).toContain("scale=2");
  });
});
