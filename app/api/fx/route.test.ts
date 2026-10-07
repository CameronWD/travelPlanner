import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { findUnique, upsert } = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { exchangeRate: { findUnique, upsert } } }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(async () => ({})) }));
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { GET } from "./route";

const HOUR = 60 * 60 * 1000;
const req = (q = "tripId=t1&base=eur&quote=aud") => new NextRequest(`http://localhost/api/fx?${q}`);

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({});
});

describe("GET /api/fx (spec 2026-10-06 §C)", () => {
  it("a fresh stored rate answers from one read, with no Frankfurter call", async () => {
    findUnique.mockResolvedValue({ rate: 1.6, manual: false, fetchedAt: new Date(Date.now() - HOUR) });
    expect(await (await GET(req())).json()).toEqual({ rate: 1.6, source: "fetched", stale: false });
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("a manual rate is reported as manual", async () => {
    findUnique.mockResolvedValue({ rate: 1.5, manual: true, fetchedAt: new Date(0) });
    expect(await (await GET(req())).json()).toEqual({ rate: 1.5, source: "manual", stale: false });
  });
  it("a stale rate whose refresh fails is reported stale", async () => {
    findUnique.mockResolvedValue({ rate: 1.4, manual: false, fetchedAt: new Date(Date.now() - 25 * HOUR) });
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await (await GET(req())).json()).toEqual({ rate: 1.4, source: "stale", stale: true });
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
  it("a fresh fetch is stored and reported as fetched", async () => {
    findUnique.mockResolvedValue(null);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ rates: { AUD: 1.7 } }) });
    expect(await (await GET(req())).json()).toEqual({ rate: 1.7, source: "fetched", stale: false });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
  it("nothing stored and no network is none", async () => {
    findUnique.mockResolvedValue(null);
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await (await GET(req())).json()).toEqual({ rate: null, source: "none", stale: false });
  });
});
