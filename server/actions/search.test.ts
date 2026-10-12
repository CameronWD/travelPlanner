import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async (id: string) => id }));
// Surprise (ADR 0051): searchTrip asks the visibility loader and spreads its
// fragments into its own queries; the loader itself is tested on its own.
const { loadSurpriseVisibilityMock } = vi.hoisted(() => ({ loadSurpriseVisibilityMock: vi.fn() }));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});

import { searchTrip, listMyTrips } from "./search";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";

beforeEach(() => {
  loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
});

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

  it("Surprise: Item and Accommodation reads carry the fragments; a hidden Stop's name still matches (the name is outside)", async () => {
    requireTripAccessMock.mockResolvedValue({ user: { id: "u-viewer" }, membership: { role: "member" } });
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ hiddenStopIds: ["s-secret"] }));
    stopFindManyMock.mockResolvedValue([{ id: "s-secret", name: "Somewhere" }]);
    itemFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);

    const hits = await searchTrip("t1", "some");

    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith("t1", "u-viewer");
    expect(itemFindManyMock.mock.calls[0][0].where).toEqual({
      tripId: "t1", forkId: null, title: { contains: "some", mode: "insensitive" }, ...MARKER_WHERE.item,
    });
    expect(accommodationFindManyMock.mock.calls[0][0].where).toEqual({
      tripId: "t1", forkId: null, name: { contains: "some", mode: "insensitive" }, ...MARKER_WHERE.accommodation,
    });
    expect(JSON.stringify(stopFindManyMock.mock.calls[0][0])).not.toContain("surpriseMarker");
    expect(JSON.stringify(transportFindManyMock.mock.calls[0][0])).not.toContain("surpriseMarker");
    expect(hits).toContainEqual(expect.objectContaining({ type: "stop", id: "s-secret", label: "Somewhere" }));
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
      { trip: { id: "t1", name: "Italy 2026", slug: "italy-2026" } },
      { trip: { id: "t2", name: "Japan 2027", slug: null } },
    ]);

    const trips = await listMyTrips();

    expect(trips).toEqual([
      { id: "t1", name: "Italy 2026", slug: "italy-2026" },
      { id: "t2", name: "Japan 2027", slug: "t2" },
    ]);
    expect(tripMemberFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", trip: { deletedAt: null } } }),
    );
  });

  it("returns [] when the user has no trips", async () => {
    requireUserMock.mockResolvedValue({ id: "u1" });
    tripMemberFindManyMock.mockResolvedValue([]);

    expect(await listMyTrips()).toEqual([]);
  });
});
