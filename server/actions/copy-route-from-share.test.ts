import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { findShareLink, loadShareStops } = vi.hoisted(() => ({ findShareLink: vi.fn(), loadShareStops: vi.fn() }));
vi.mock("@/lib/share-lookup", () => ({ findShareLink, loadShareStops }));

import { routeStopsFromShare, sharedRouteName } from "./copy-route-from-share";

const LINK = { id: "link-1", trip: { id: "t1", name: "Christmas in Europe", startDate: "2026-12-04", endDate: "2027-01-08" } };

beforeEach(() => {
  vi.clearAllMocks();
  findShareLink.mockResolvedValue(LINK);
  loadShareStops.mockResolvedValue([
    { id: "s1", name: "London", country: "England", lat: 51.5, lng: -0.1, timezone: "Europe/London", arriveDate: "2026-12-05", departDate: "2026-12-10", sortOrder: 0 },
    { id: "s2", name: "Paris", country: "France", lat: 48.9, lng: 2.35, timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-15", sortOrder: 1 },
  ]);
});

describe("routeStopsFromShare (CONTEXT.md Route copy)", () => {
  it("copies the public stops as name, country, coords and nights — nothing else", async () => {
    const r = await routeStopsFromShare("tok");
    expect(r).toEqual({
      linkId: "link-1",
      tripName: "Christmas in Europe",
      stops: [
        { name: "London", country: "England", lat: 51.5, lng: -0.1, nights: 5 },
        { name: "Paris", country: "France", lat: 48.9, lng: 2.35, nights: 5 },
      ],
    });
    expect(findShareLink).toHaveBeenCalledWith("tok");
  });
  it("returns null for an unknown/revoked token (a revoked link's row is deleted)", async () => {
    findShareLink.mockResolvedValue(null);
    expect(await routeStopsFromShare("gone")).toBeNull();
    expect(loadShareStops).not.toHaveBeenCalled();
  });
  it("returns null for a date-less trip, exactly as the share page 404s it", async () => {
    findShareLink.mockResolvedValue({ ...LINK, trip: { ...LINK.trip, startDate: null } });
    expect(await routeStopsFromShare("tok")).toBeNull();
  });
  it("is not a server-action module (every export would be a public endpoint)", () => {
    const src = readFileSync(join(__dirname, "copy-route-from-share.ts"), "utf8");
    expect(src).not.toMatch(/^\s*["']use server["']/m);
  });
});

describe("sharedRouteName (New trip pre-fill)", () => {
  it("resolves just the trip name, without loading the stops", async () => {
    expect(await sharedRouteName("tok")).toBe("Christmas in Europe");
    expect(findShareLink).toHaveBeenCalledWith("tok");
    expect(loadShareStops).not.toHaveBeenCalled();
  });
  it("is null exactly when routeStopsFromShare would refuse the token", async () => {
    findShareLink.mockResolvedValue(null);
    expect(await sharedRouteName("gone")).toBeNull();
    findShareLink.mockResolvedValue({ ...LINK, trip: { ...LINK.trip, endDate: null } });
    expect(await sharedRouteName("tok")).toBeNull();
  });
});
