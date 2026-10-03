import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { purgeExpiredDeletedTripsMock } = vi.hoisted(() => ({
  purgeExpiredDeletedTripsMock: vi.fn(),
}));

vi.mock("@/lib/trip-purge", () => ({
  purgeExpiredDeletedTrips: purgeExpiredDeletedTripsMock,
}));

import { GET } from "./route";

const ORIGINAL_SECRET = process.env.CRON_SECRET;

describe("GET /api/cron/purge-trips", () => {
  beforeEach(() => {
    purgeExpiredDeletedTripsMock.mockReset();
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
  });

  it("purges and returns the count when authorized", async () => {
    purgeExpiredDeletedTripsMock.mockResolvedValue({ purged: ["a", "b"] });
    const req = new NextRequest("https://example.com/api/cron/purge-trips", {
      headers: { authorization: "Bearer shh" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ purged: 2 });
    expect(purgeExpiredDeletedTripsMock).toHaveBeenCalled();
  });
});
