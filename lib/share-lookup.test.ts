import { describe, it, expect, vi, beforeEach } from "vitest";

const { findFirst, findMany } = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { shareLink: { findFirst }, stop: { findMany } } }));

import { findShareLink, loadShareStops } from "./share-lookup";

beforeEach(() => vi.clearAllMocks());

describe("findShareLink", () => {
  it("looks the token up and selects the dials, never money", async () => {
    findFirst.mockResolvedValue(null);
    expect(await findShareLink("tok")).toBeNull();
    const arg = findFirst.mock.calls[0][0];
    expect(arg.where).toEqual({ token: "tok", trip: { deletedAt: null } });
    expect(Object.keys(arg.select)).toEqual(expect.arrayContaining(["id", "includeJournal", "showTravellers", "trip"]));
    expect(Object.keys(arg.select.trip.select)).not.toContain("homeCurrency");
  });

  // ADR 0067 (Recently deleted): findUnique can't filter on a relation, so
  // this lookup is a findFirst — a deleted Trip's token must miss, same as
  // an unknown one.
  it("misses a Trip in Recently deleted, same as an unknown token", async () => {
    findFirst.mockResolvedValue(null);
    await findShareLink("tok");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: "tok", trip: { deletedAt: null } } }),
    );
  });
});

describe("loadShareStops", () => {
  it("reads real-plan stops, never notes, and orders them canonically", async () => {
    findMany.mockResolvedValue([
      { id: "b", name: "B", country: null, lat: 1, lng: 1, timezone: null, arriveDate: "2026-01-05", departDate: "2026-01-06", nights: null, sortOrder: 0 },
      { id: "a", name: "A", country: "X", lat: 2, lng: 2, timezone: "Europe/Paris", arriveDate: "2026-01-01", departDate: "2026-01-05", nights: null, sortOrder: 1 },
    ]);
    const stops = await loadShareStops("t1");
    const arg = findMany.mock.calls[0][0];
    expect(Object.keys(arg.select)).not.toContain("notes");
    expect(stops.map((s) => s.id)).toEqual(["a", "b"]);
    expect(stops[1].timezone).toBe("UTC");
  });

  // ADR 0073 (spec 2026-10-13 D4): rough Stops are part of the shared route.
  it("includes rough Stops: no date filter, selects nights, keeps their arranged slot", async () => {
    findMany.mockResolvedValue([
      { id: "d2", name: "D2", country: null, lat: null, lng: null, timezone: "UTC", arriveDate: "2026-01-05", departDate: "2026-01-06", nights: null, sortOrder: 0 },
      { id: "r", name: "Bali", country: "Indonesia", lat: null, lng: null, timezone: null, arriveDate: null, departDate: null, nights: 4, sortOrder: 1 },
      { id: "d1", name: "D1", country: null, lat: null, lng: null, timezone: "UTC", arriveDate: "2026-01-01", departDate: "2026-01-05", nights: null, sortOrder: 2 },
    ]);
    const stops = await loadShareStops("t");
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ tripId: "t", forkId: null });
    expect(arg.select.nights).toBe(true);
    expect(stops.map((s) => s.id)).toEqual(["d1", "r", "d2"]);
    expect(stops[1]).toMatchObject({ arriveDate: null, departDate: null, nights: 4, timezone: "UTC" });
  });
});
