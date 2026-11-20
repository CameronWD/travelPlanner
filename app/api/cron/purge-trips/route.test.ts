import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { purgeExpiredDeletedTripsMock, purgeOldUsageMock, deleteManyMock, reportErrorMock } = vi.hoisted(() => ({
  purgeExpiredDeletedTripsMock: vi.fn(),
  purgeOldUsageMock: vi.fn(),
  deleteManyMock: vi.fn(),
  reportErrorMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/trip-purge", () => ({
  purgeExpiredDeletedTrips: purgeExpiredDeletedTripsMock,
}));
vi.mock("@/lib/usage/purge", () => ({ purgeOldUsage: purgeOldUsageMock }));
vi.mock("@/lib/db", () => ({ db: { usageRecord: { deleteMany: deleteManyMock } } }));
vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));

import { GET } from "./route";

const ORIGINAL_SECRET = process.env.CRON_SECRET;

describe("GET /api/cron/purge-trips", () => {
  beforeEach(() => {
    purgeExpiredDeletedTripsMock.mockReset();
    purgeOldUsageMock.mockReset().mockResolvedValue(0);
    deleteManyMock.mockReset();
    reportErrorMock.mockReset().mockResolvedValue(undefined);
    process.env.CRON_SECRET = "shh";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_SECRET;
  });

  it("returns 401 without the secret", async () => {
    const req = new NextRequest("https://example.com/api/cron/purge-trips");
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(purgeExpiredDeletedTripsMock).not.toHaveBeenCalled();
    expect(purgeOldUsageMock).not.toHaveBeenCalled();
  });

  it("purges and returns the count when authorized", async () => {
    purgeExpiredDeletedTripsMock.mockResolvedValue({ purged: ["a", "b"] });
    purgeOldUsageMock.mockResolvedValue(3);
    const req = new NextRequest("https://example.com/api/cron/purge-trips", {
      headers: { authorization: "Bearer shh" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ purged: 2, usagePurged: 3 });
    expect(purgeExpiredDeletedTripsMock).toHaveBeenCalled();
  });

  it("still answers 200 and reports the error when the Usage purge throws", async () => {
    const err = new Error("no such table");
    purgeExpiredDeletedTripsMock.mockResolvedValue({ purged: ["a"] });
    purgeOldUsageMock.mockRejectedValue(err);
    const req = new NextRequest("https://example.com/api/cron/purge-trips", {
      headers: { authorization: "Bearer shh" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ purged: 1, usagePurged: null });
    expect(reportErrorMock).toHaveBeenCalledWith(err, {
      route: "/api/cron/purge-trips",
      source: "server",
    });
  });

  it("does not run the Usage purge when the Trip purge throws", async () => {
    purgeExpiredDeletedTripsMock.mockRejectedValue(new Error("db down"));
    const req = new NextRequest("https://example.com/api/cron/purge-trips", {
      headers: { authorization: "Bearer shh" },
    });
    await GET(req);
    expect(purgeOldUsageMock).not.toHaveBeenCalled();
  });

  it("reports the error and returns 500 when the purge throws", async () => {
    const err = new Error("db down");
    purgeExpiredDeletedTripsMock.mockRejectedValue(err);
    const req = new NextRequest("https://example.com/api/cron/purge-trips", {
      headers: { authorization: "Bearer shh" },
    });
    const res = await GET(req);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Internal server error" });
    expect(reportErrorMock).toHaveBeenCalledWith(err, {
      route: "/api/cron/purge-trips",
      source: "server",
    });
  });

  describe("purgeOldUsage cutoff", () => {
    it("deletes by when the server received a record, 180 days back from now", async () => {
      const { purgeOldUsage } = await vi.importActual<typeof import("@/lib/usage/purge")>("@/lib/usage/purge");
      deleteManyMock.mockResolvedValue({ count: 4 });
      const now = new Date("2026-11-20T03:17:00.000Z");
      await expect(purgeOldUsage(now)).resolves.toBe(4);
      expect(deleteManyMock).toHaveBeenCalledWith({
        where: { receivedAt: { lt: new Date("2026-05-24T03:17:00.000Z") } },
      });
    });

    it("answers 0 on an empty table", async () => {
      const { purgeOldUsage } = await vi.importActual<typeof import("@/lib/usage/purge")>("@/lib/usage/purge");
      deleteManyMock.mockResolvedValue({ count: 0 });
      await expect(purgeOldUsage()).resolves.toBe(0);
    });
  });
});
