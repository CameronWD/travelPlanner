import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { requireUserMock, requireTripAccessMock, fetchBytesMock, staticMapIdMock, dbMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  requireTripAccessMock: vi.fn(),
  fetchBytesMock: vi.fn(),
  staticMapIdMock: vi.fn(),
  dbMock: new Proxy({}, { get: () => { throw new Error("route read the database"); } }),
}));

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock, requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/map/static-map-fetch", () => ({ fetchStaticMapBytes: fetchBytesMock }));
vi.mock("@/lib/map/google-config", () => ({ staticMapId: staticMapIdMock }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { GET } from "./route";

function get(query: string) {
  return GET(new NextRequest(`http://test.local/api/trips/t1/route-snapshot${query}`), {
    params: Promise.resolve({ tripId: "t1" }),
  });
}

const P = encodeURIComponent("1.5,2.5,0,1;3,4,2,3");

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "u1" });
  requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "member" } });
  staticMapIdMock.mockReturnValue("MAP");
  fetchBytesMock.mockResolvedValue(Buffer.from([1, 2, 3]));
});

describe("GET /api/trips/:tripId/route-snapshot", () => {
  it("stops at the user guard, without a Google call", async () => {
    requireUserMock.mockRejectedValue(new Error("redirect"));
    await expect(get(`?shape=tall&p=${P}`)).rejects.toThrow("redirect");
    expect(requireTripAccessMock).not.toHaveBeenCalled();
    expect(fetchBytesMock).not.toHaveBeenCalled();
  });

  it("stops at the membership guard, without a Google call", async () => {
    requireTripAccessMock.mockRejectedValue(new Error("not a member"));
    await expect(get(`?shape=tall&p=${P}`)).rejects.toThrow("not a member");
    expect(requireTripAccessMock).toHaveBeenCalledWith("t1");
    expect(fetchBytesMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown shape", `?shape=wide&p=${P}`],
    ["a missing shape", `?p=${P}`],
    ["pins the decoder rejects", "?shape=tall&p=nonsense"],
    ["no pins", "?shape=tall"],
  ])("is a 400 for %s, uncached, without a Google call", async (_n, query) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchBytesMock).not.toHaveBeenCalled();
  });

  it("is a 503 when no map id is configured", async () => {
    staticMapIdMock.mockReturnValue(null);
    const res = await get(`?shape=tall&p=${P}`);
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchBytesMock).not.toHaveBeenCalled();
  });

  it("is a 503 when Google gives nothing", async () => {
    fetchBytesMock.mockResolvedValue(null);
    const res = await get(`?shape=tall&p=${P}`);
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves the PNG, drawing exactly the pins in the URL, never reading the database", async () => {
    const res = await get(`?shape=band&p=${P}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));
    expect(fetchBytesMock).toHaveBeenCalledWith({
      mapId: "MAP",
      width: 640,
      height: 360,
      home: null,
      showReturn: false,
      stops: [
        { id: "1", lat: 1.5, lng: 2.5, sortOrder: 0, number: 1 },
        { id: "3", lat: 3, lng: 4, sortOrder: 2, number: 3 },
      ],
    });
  });
});
