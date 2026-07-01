import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the search server actions.
 *
 * Mocks:
 *   - lib/db     → assert Prisma call shapes without hitting the database
 *   - lib/guards → requireTripAccess / requireUser return predictable values
 */

const {
  requireTripAccessMock,
  requireUserMock,
  stopFindManyMock,
  itemFindManyMock,
  transportFindManyMock,
  accommodationFindManyMock,
  tripMemberFindManyMock,
} = vi.hoisted(() => {
  return {
    requireTripAccessMock: vi.fn(),
    requireUserMock: vi.fn(),
    stopFindManyMock: vi.fn(),
    itemFindManyMock: vi.fn(),
    transportFindManyMock: vi.fn(),
    accommodationFindManyMock: vi.fn(),
    tripMemberFindManyMock: vi.fn(),
  };
});

vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
  requireUser: requireUserMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    tripMember: { findMany: tripMemberFindManyMock },
  },
}));

import { searchTrip, listMyTrips } from "./search";

afterEach(() => {
  vi.clearAllMocks();
});

describe("searchTrip", () => {
  it("returns labelled, href'd hits across entity types for a non-empty query", async () => {
    requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } });
    stopFindManyMock.mockResolvedValue([{ id: "s1", name: "Rome" }]);
    itemFindManyMock.mockResolvedValue([{ id: "i1", title: "Colosseum", date: "2026-08-02", stopId: "s1" }]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);

    const hits = await searchTrip("t1", "co");

    expect(hits).toContainEqual({ type: "stop", id: "s1", label: "Rome", href: "/trips/t1/plan" });
    expect(hits).toContainEqual(
      expect.objectContaining({ type: "item", id: "i1", label: "Colosseum", href: "/trips/t1/day/2026-08-02" }),
    );
  });

  it("scopes all four reads to the real plan (forkId: null)", async () => {
    requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } });
    stopFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);

    await searchTrip("t1", "rome");

    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "t1", forkId: null }) }),
    );
    expect(itemFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "t1", forkId: null }) }),
    );
    expect(transportFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "t1", forkId: null }) }),
    );
    expect(accommodationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "t1", forkId: null }) }),
    );
  });

  it("routes unscheduled items (date=null) to /wishlist", async () => {
    requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } });
    stopFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([{ id: "i2", title: "Pottery class", date: null, stopId: null }]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);

    const hits = await searchTrip("t1", "pot");

    expect(hits).toContainEqual(
      expect.objectContaining({ type: "item", id: "i2", href: "/trips/t1/wishlist" }),
    );
  });

  it("includes transport and accommodation hits", async () => {
    requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } });
    stopFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([{ id: "tr1", depPlace: "Paris CDG", arrPlace: "Rome FCO" }]);
    accommodationFindManyMock.mockResolvedValue([{ id: "ac1", name: "Hotel Colosseo" }]);

    const hits = await searchTrip("t1", "rom");

    expect(hits).toContainEqual(
      expect.objectContaining({ type: "transport", id: "tr1", href: "/trips/t1/plan" }),
    );
    expect(hits).toContainEqual(
      expect.objectContaining({ type: "accommodation", id: "ac1", label: "Hotel Colosseo", href: "/trips/t1/plan" }),
    );
  });

  it("returns [] for a blank query without hitting the db", async () => {
    expect(await searchTrip("t1", "  ")).toEqual([]);
    expect(stopFindManyMock).not.toHaveBeenCalled();
  });

  it("returns [] for an empty string query without hitting the db", async () => {
    expect(await searchTrip("t1", "")).toEqual([]);
    expect(stopFindManyMock).not.toHaveBeenCalled();
  });
});

describe("listMyTrips", () => {
  it("returns trips the current user is a member of", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    tripMemberFindManyMock.mockResolvedValue([
      { trip: { id: "t1", name: "Italy 2026" } },
      { trip: { id: "t2", name: "Japan 2027" } },
    ]);

    const trips = await listMyTrips();

    expect(trips).toEqual([
      { id: "t1", name: "Italy 2026" },
      { id: "t2", name: "Japan 2027" },
    ]);
    expect(tripMemberFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } }),
    );
  });

  it("returns [] when the user has no trips", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    tripMemberFindManyMock.mockResolvedValue([]);

    expect(await listMyTrips()).toEqual([]);
  });
});
