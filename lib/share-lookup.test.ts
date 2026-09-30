import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique, findMany } = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { shareLink: { findUnique }, stop: { findMany } } }));

import { findShareLink, loadShareStops } from "./share-lookup";

beforeEach(() => vi.clearAllMocks());

describe("findShareLink", () => {
  it("looks the token up and selects the dials, never money", async () => {
    findUnique.mockResolvedValue(null);
    expect(await findShareLink("tok")).toBeNull();
    const arg = findUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ token: "tok" });
    expect(Object.keys(arg.select)).toEqual(expect.arrayContaining(["id", "includeJournal", "showTravellers", "trip"]));
    expect(Object.keys(arg.select.trip.select)).not.toContain("homeCurrency");
  });
});

describe("loadShareStops", () => {
  it("reads only dated real-plan stops, never notes, and orders them canonically", async () => {
    findMany.mockResolvedValue([
      { id: "b", name: "B", country: null, lat: 1, lng: 1, timezone: null, arriveDate: "2026-01-05", departDate: "2026-01-06", sortOrder: 0 },
      { id: "a", name: "A", country: "X", lat: 2, lng: 2, timezone: "Europe/Paris", arriveDate: "2026-01-01", departDate: "2026-01-05", sortOrder: 1 },
    ]);
    const stops = await loadShareStops("t1");
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ tripId: "t1", forkId: null, arriveDate: { not: null } });
    expect(Object.keys(arg.select)).not.toContain("notes");
    expect(stops.map((s) => s.id)).toEqual(["a", "b"]);
    expect(stops[1].timezone).toBe("UTC");
  });
});
