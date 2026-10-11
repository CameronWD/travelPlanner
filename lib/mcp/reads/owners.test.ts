import { beforeEach, describe, expect, it, vi } from "vitest";

const { stopFindMany, accommodationFindMany, transportFindMany, itemFindMany } = vi.hoisted(() => ({
  stopFindMany: vi.fn(),
  accommodationFindMany: vi.fn(),
  transportFindMany: vi.fn(),
  itemFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    stop: { findMany: stopFindMany },
    accommodation: { findMany: accommodationFindMany },
    transport: { findMany: transportFindMany },
    item: { findMany: itemFindMany },
  },
}));

import { loadOwners, ownerKey, REMOVED_LABEL } from "./owners";

const TRIP_ID = "trip-1";

describe("loadOwners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopFindMany.mockResolvedValue([]);
    accommodationFindMany.mockResolvedValue([]);
    transportFindMany.mockResolvedValue([]);
    itemFindMany.mockResolvedValue([]);
  });

  it("labels a Stop owner", async () => {
    stopFindMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.includes("s-rome")
        ? Promise.resolve([{ id: "s-rome", name: "Rome", forkId: null }])
        : Promise.resolve([]),
    );
    const { owners } = await loadOwners(TRIP_ID, [{ kind: "STOP", id: "s-rome" }]);
    expect(owners.get(ownerKey("STOP", "s-rome"))).toEqual({
      kind: "STOP",
      id: "s-rome",
      label: "Stop: Rome",
      stopId: "s-rome",
    });
  });

  it("labels an Accommodation owner with its Stop", async () => {
    accommodationFindMany.mockResolvedValue([
      { id: "a1", name: "Hotel Raphael", stopId: "s-rome", forkId: null },
    ]);
    stopFindMany.mockResolvedValue([{ id: "s-rome", name: "Rome", forkId: null }]);
    const { owners } = await loadOwners(TRIP_ID, [{ kind: "ACCOMMODATION", id: "a1" }]);
    expect(owners.get(ownerKey("ACCOMMODATION", "a1"))).toEqual({
      kind: "ACCOMMODATION",
      id: "a1",
      label: "Accommodation: Hotel Raphael at Rome",
      stopId: "s-rome",
    });
  });

  it("labels a Transport owner by each end's Stop", async () => {
    transportFindMany.mockResolvedValue([
      {
        id: "t1",
        mode: "CAR",
        fromStopId: "s-dub",
        toStopId: "s-como",
        depIsHome: false,
        arrIsHome: false,
        depPlace: null,
        arrPlace: null,
        forkId: null,
      },
    ]);
    stopFindMany.mockResolvedValue([
      { id: "s-dub", name: "Dublin", forkId: null },
      { id: "s-como", name: "Como", forkId: null },
    ]);
    const { owners } = await loadOwners(TRIP_ID, [{ kind: "TRANSPORT", id: "t1" }]);
    expect(owners.get(ownerKey("TRANSPORT", "t1"))).toEqual({
      kind: "TRANSPORT",
      id: "t1",
      label: "Transport: Dublin → Como",
      stopId: "s-dub",
    });
  });

  it("a home-departing Transport reads 'Transport: home → Lisbon'", async () => {
    transportFindMany.mockResolvedValue([
      {
        id: "t2",
        mode: "FLIGHT",
        fromStopId: null,
        toStopId: "s-lis",
        depIsHome: true,
        arrIsHome: false,
        depPlace: null,
        arrPlace: null,
        forkId: null,
      },
    ]);
    stopFindMany.mockResolvedValue([{ id: "s-lis", name: "Lisbon", forkId: null }]);
    const { owners } = await loadOwners(TRIP_ID, [{ kind: "TRANSPORT", id: "t2" }]);
    expect(owners.get(ownerKey("TRANSPORT", "t2"))!.label).toBe("Transport: home → Lisbon");
    expect(owners.get(ownerKey("TRANSPORT", "t2"))!.stopId).toBeNull();
  });

  it("a Transport with no Stops but places reads 'Transport: Dublin Airport → Bergamo'", async () => {
    transportFindMany.mockResolvedValue([
      {
        id: "t3",
        mode: "FLIGHT",
        fromStopId: null,
        toStopId: null,
        depIsHome: false,
        arrIsHome: false,
        depPlace: "Dublin Airport",
        arrPlace: "Bergamo",
        forkId: null,
      },
    ]);
    const { owners } = await loadOwners(TRIP_ID, [{ kind: "TRANSPORT", id: "t3" }]);
    expect(owners.get(ownerKey("TRANSPORT", "t3"))!.label).toBe("Transport: Dublin Airport → Bergamo");
  });

  it("labels an Item with a Stop and a date", async () => {
    itemFindMany.mockResolvedValue([
      { id: "i1", title: "Vatican tour", stopId: "s-rome", date: "2026-12-19", forkId: null },
    ]);
    stopFindMany.mockResolvedValue([{ id: "s-rome", name: "Rome", forkId: null }]);
    const { owners } = await loadOwners(TRIP_ID, [{ kind: "ITEM", id: "i1" }]);
    expect(owners.get(ownerKey("ITEM", "i1"))).toEqual({
      kind: "ITEM",
      id: "i1",
      label: "Activity: Vatican tour at Rome, Sat 19 Dec",
      stopId: "s-rome",
    });
  });

  it("labels a Wishlist Item (no Stop, no date) with the Wishlist suffix", async () => {
    itemFindMany.mockResolvedValue([{ id: "i2", title: "Someday gelato", stopId: null, date: null, forkId: null }]);
    const { owners } = await loadOwners(TRIP_ID, [{ kind: "ITEM", id: "i2" }]);
    expect(owners.get(ownerKey("ITEM", "i2"))).toEqual({
      kind: "ITEM",
      id: "i2",
      label: "Activity: Someday gelato (Wishlist)",
      stopId: null,
    });
  });

  it("a ref to a fork-owned row lands in forkOwned and not in owners", async () => {
    stopFindMany.mockResolvedValue([{ id: "s-fork", name: "Fork Rome", forkId: "fork-1" }]);
    const { owners, forkOwned } = await loadOwners(TRIP_ID, [{ kind: "STOP", id: "s-fork" }]);
    expect(owners.has(ownerKey("STOP", "s-fork"))).toBe(false);
    expect(forkOwned.has(ownerKey("STOP", "s-fork"))).toBe(true);
  });

  it("a ref to a missing row is in neither map", async () => {
    stopFindMany.mockResolvedValue([]);
    const { owners, forkOwned } = await loadOwners(TRIP_ID, [{ kind: "STOP", id: "s-gone" }]);
    expect(owners.has(ownerKey("STOP", "s-gone"))).toBe(false);
    expect(forkOwned.has(ownerKey("STOP", "s-gone"))).toBe(false);
  });

  it("REMOVED_LABEL is the exported '(removed)' constant", () => {
    expect(REMOVED_LABEL).toBe("(removed)");
  });

  it("queries each owner table scoped to the trip with ids and forkId selected (fork-detection shape)", async () => {
    await loadOwners(TRIP_ID, [{ kind: "STOP", id: "s1" }]);
    expect(stopFindMany).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, id: { in: ["s1"] } },
      select: expect.objectContaining({ forkId: true }),
    });
  });
});
