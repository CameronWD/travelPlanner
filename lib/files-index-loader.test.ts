import { beforeEach, describe, expect, it, vi } from "vitest";

const stopFindManyMock = vi.hoisted(() => vi.fn());
const itemFindManyMock = vi.hoisted(() => vi.fn());
const transportFindManyMock = vi.hoisted(() => vi.fn());
const accommodationFindManyMock = vi.hoisted(() => vi.fn());
const journalEntryFindManyMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  db: {
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    journalEntry: { findMany: journalEntryFindManyMock },
  },
}));

import { loadFileOwners, ownerKey, REMOVED_OWNER } from "./files-index-loader";

beforeEach(() => {
  for (const m of [stopFindManyMock, itemFindManyMock, transportFindManyMock, accommodationFindManyMock, journalEntryFindManyMock]) {
    m.mockReset().mockResolvedValue([]);
  }
});

describe("loadFileOwners", () => {
  it("names each owner and links to where it lives", async () => {
    stopFindManyMock
      .mockResolvedValueOnce([{ id: "s-rome", name: "Rome" }]) // the STOP owners
      .mockResolvedValueOnce([{ id: "s-rome", name: "Rome" }, { id: "s-flo", name: "Florence" }]); // leg endpoints
    itemFindManyMock.mockResolvedValue([
      { id: "i-sched", title: "Colosseum", date: "2026-12-05", stopId: "s-rome" },
      { id: "i-idea", title: "Gelato", date: null, stopId: "s-rome" },
      { id: "i-wish", title: "Someday", date: null, stopId: null },
    ]);
    transportFindManyMock.mockResolvedValue([{ id: "t1", fromStopId: "s-rome", toStopId: "s-flo" }]);
    accommodationFindManyMock.mockResolvedValue([{ id: "a1", name: "Hotel Roma", stopId: "s-rome" }]);
    journalEntryFindManyMock.mockResolvedValue([{ id: "j1", date: "2026-12-06" }]);

    const owners = await loadFileOwners("trip-1", "europe", [
      { targetType: "STOP", targetId: "s-rome" },
      { targetType: "ITEM", targetId: "i-sched" },
      { targetType: "ITEM", targetId: "i-idea" },
      { targetType: "ITEM", targetId: "i-wish" },
      { targetType: "TRANSPORT", targetId: "t1" },
      { targetType: "ACCOMMODATION", targetId: "a1" },
      { targetType: "JOURNAL", targetId: "j1" },
    ]);

    expect(owners.get(ownerKey("STOP", "s-rome"))).toEqual({ label: "Rome", href: "/trips/europe/plan#open=s-rome" });
    expect(owners.get(ownerKey("ITEM", "i-sched"))).toEqual({ label: "Colosseum", href: "/trips/europe/day/2026-12-05" });
    expect(owners.get(ownerKey("ITEM", "i-idea"))).toEqual({ label: "Gelato", href: "/trips/europe/plan#open=s-rome" });
    expect(owners.get(ownerKey("ITEM", "i-wish"))).toEqual({ label: "Someday", href: "/trips/europe/wishlist" });
    expect(owners.get(ownerKey("TRANSPORT", "t1"))).toEqual({ label: "Rome → Florence", href: "/trips/europe/plan#open=s-rome" });
    expect(owners.get(ownerKey("ACCOMMODATION", "a1"))).toEqual({ label: "Hotel Roma", href: "/trips/europe/plan#open=s-rome" });
    expect(owners.get(ownerKey("JOURNAL", "j1"))).toEqual({ label: "Journal · 2026-12-06", href: "/trips/europe/journal" });
  });

  it("scopes every lookup to the trip and only to the ids asked for", async () => {
    await loadFileOwners("trip-1", "europe", [{ targetType: "ITEM", targetId: "i1" }]);
    expect(itemFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip-1", id: { in: ["i1"] } } }));
    expect(stopFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip-1", id: { in: [] } } }));
  });

  // Review Focus 4: a deleted owner is absent from the map; the page shows REMOVED_OWNER.
  it("leaves a missing owner out, and REMOVED_OWNER has no link", async () => {
    const owners = await loadFileOwners("trip-1", "europe", [{ targetType: "ITEM", targetId: "gone" }]);
    expect(owners.get(ownerKey("ITEM", "gone"))).toBeUndefined();
    expect(REMOVED_OWNER).toEqual({ label: "(removed)", href: null });
  });
});
