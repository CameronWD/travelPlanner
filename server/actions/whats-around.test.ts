import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireTripAccess: vi.fn().mockResolvedValue({ user: { id: "u1" }, membership: { role: "member" } }),
  requireOutsideSurprise: vi.fn().mockResolvedValue(null),
  takeGoogleQuota: vi.fn().mockResolvedValue(true),
  hasServerKey: vi.fn().mockReturnValue(true),
  searchNearby: vi.fn(),
  cachedNearby: vi.fn(),
  saveNearby: vi.fn(),
  tripFindUnique: vi.fn(),
  accFindUnique: vi.fn(),
  stopFindUnique: vi.fn(),
  itemFindUnique: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: m.requireTripAccess }));
vi.mock("@/lib/surprise-guard", () => ({ requireOutsideSurprise: m.requireOutsideSurprise }));
vi.mock("@/lib/google-usage", () => ({ takeGoogleQuota: m.takeGoogleQuota }));
vi.mock("@/lib/google-fetch", () => ({ hasServerKey: m.hasServerKey }));
vi.mock("@/lib/nearby/search", () => ({ searchNearby: m.searchNearby }));
vi.mock("@/lib/nearby/cache", () => ({
  cachedNearby: m.cachedNearby,
  saveNearby: m.saveNearby,
  nearbyCacheKey: (p: { lat: number; lng: number }, k: string) => `day|${k}|${p.lat.toFixed(3)},${p.lng.toFixed(3)}`,
}));
vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: m.tripFindUnique },
    accommodation: { findUnique: m.accFindUnique },
    stop: { findUnique: m.stopFindUnique },
    item: { findUnique: m.itemFindUnique },
  },
}));

import { whatsAround } from "./whats-around";

const PLACE = { placeId: "p1", name: "Ramiro", utcOffsetMinutes: 0, openNow: null, closesAt: null, openingHours: null };
const HOME = { lat: 38.7139, lng: -9.1334 };

describe("whatsAround", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: { role: "member" } });
    m.requireOutsideSurprise.mockResolvedValue(null);
    m.takeGoogleQuota.mockResolvedValue(true);
    m.hasServerKey.mockReturnValue(true);
    m.tripFindUnique.mockResolvedValue({ whatsAroundEnabled: true });
    m.accFindUnique.mockResolvedValue({ tripId: "t1", lat: HOME.lat, lng: HOME.lng });
    m.stopFindUnique.mockResolvedValue({ tripId: "t1", lat: 1.5, lng: 2.5 });
    m.itemFindUnique.mockResolvedValue({ tripId: "t1", lat: 3.5, lng: 4.5 });
    m.cachedNearby.mockResolvedValue(null);
    m.searchNearby.mockResolvedValue([PLACE]);
  });

  const acc = { from: { kind: "accommodation", id: "a1" }, nearbyKind: "food" } as const;

  it("searches, caches and returns the places with the origin", async () => {
    expect(await whatsAround("t1", acc)).toEqual({ status: "ok", places: [PLACE], origin: HOME });
    expect(m.takeGoogleQuota).toHaveBeenCalledWith("nearby-search", 33);
    expect(m.saveNearby).toHaveBeenCalledWith("day|food|38.714,-9.133", "OK", [PLACE]);
  });

  it("derives open status at serve time, for a cache hit and a fresh fetch alike", async () => {
    const week = { week: { fri: [["12:00", "23:00"]] }, seasons: [], closed: [] };
    const cached = { ...PLACE, utcOffsetMinutes: 60, openNow: true, closesAt: "23:00", openingHours: week };
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-06T09:30:00Z"));
      m.cachedNearby.mockResolvedValue({ status: "OK", results: [cached] });
      const morning = await whatsAround("t1", acc);
      expect(morning).toMatchObject({ places: [{ openNow: false, closesAt: null }] });
      vi.setSystemTime(new Date("2026-11-06T20:00:00Z"));
      expect(await whatsAround("t1", acc)).toMatchObject({ places: [{ openNow: true, closesAt: "23:00" }] });
      vi.setSystemTime(new Date("2026-11-06T22:30:00Z"));
      expect(await whatsAround("t1", acc)).toMatchObject({ places: [{ openNow: false, closesAt: null }] });
      m.cachedNearby.mockResolvedValue(null);
      m.searchNearby.mockResolvedValue([{ ...cached, openNow: false, closesAt: null }]);
      vi.setSystemTime(new Date("2026-11-06T20:00:00Z"));
      expect(await whatsAround("t1", acc)).toMatchObject({ places: [{ openNow: true, closesAt: "23:00" }] });
      expect(m.saveNearby.mock.calls[0][2][0]).toMatchObject({ openNow: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses when the switch is off, with no quota and no Google call", async () => {
    m.tripFindUnique.mockResolvedValue({ whatsAroundEnabled: false });
    expect(await whatsAround("t1", acc)).toEqual({ status: "off" });
    expect(m.takeGoogleQuota).not.toHaveBeenCalled();
    expect(m.searchNearby).not.toHaveBeenCalled();
  });

  it("serves a cache hit without taking quota or calling Google", async () => {
    m.cachedNearby.mockResolvedValue({ status: "OK", results: [PLACE] });
    expect(await whatsAround("t1", acc)).toEqual({ status: "ok", places: [PLACE], origin: HOME });
    expect(m.takeGoogleQuota).not.toHaveBeenCalled();
    expect(m.searchNearby).not.toHaveBeenCalled();
  });

  it("answers unavailable from a cached error without retrying", async () => {
    m.cachedNearby.mockResolvedValue({ status: "ERROR", results: [] });
    expect(await whatsAround("t1", acc)).toEqual({ status: "unavailable" });
    expect(m.searchNearby).not.toHaveBeenCalled();
  });

  it("stores a failed search as ERROR and answers unavailable", async () => {
    m.searchNearby.mockResolvedValue(null);
    expect(await whatsAround("t1", acc)).toEqual({ status: "unavailable" });
    expect(m.saveNearby).toHaveBeenCalledWith("day|food|38.714,-9.133", "ERROR", []);
  });

  it("searches from the device point and never reads or writes the cache", async () => {
    const out = await whatsAround("t1", { from: { kind: "device", lat: 10.25, lng: 20.5 }, nearbyKind: "cafes" });
    expect(out).toEqual({ status: "ok", places: [PLACE], origin: { lat: 10.25, lng: 20.5 } });
    expect(m.cachedNearby).not.toHaveBeenCalled();
    expect(m.saveNearby).not.toHaveBeenCalled();
    expect(m.searchNearby).toHaveBeenCalledWith({ lat: 10.25, lng: 20.5 }, "cafes");
  });

  it("does not store a failed device search either", async () => {
    m.searchNearby.mockResolvedValue(null);
    expect(await whatsAround("t1", { from: { kind: "device", lat: 10, lng: 20 }, nearbyKind: "food" })).toEqual({ status: "unavailable" });
    expect(m.saveNearby).not.toHaveBeenCalled();
  });

  it("rejects a surprised viewer for an item point before any search", async () => {
    m.requireOutsideSurprise.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(whatsAround("t1", { from: { kind: "item", id: "i1" }, nearbyKind: "food" })).rejects.toThrow("NOT_FOUND");
    expect(m.requireOutsideSurprise).toHaveBeenCalledWith("u1", { itemId: "i1" });
    expect(m.takeGoogleQuota).not.toHaveBeenCalled();
    expect(m.searchNearby).not.toHaveBeenCalled();
  });

  it("rejects a surprised viewer for an unlocated item too, not no-point", async () => {
    m.itemFindUnique.mockResolvedValue({ tripId: "t1", lat: null, lng: null });
    m.requireOutsideSurprise.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(whatsAround("t1", { from: { kind: "item", id: "i1" }, nearbyKind: "food" })).rejects.toThrow("NOT_FOUND");
  });

  it("guards accommodation and stop points with their own Surprise refs", async () => {
    await whatsAround("t1", acc);
    expect(m.requireOutsideSurprise).toHaveBeenCalledWith("u1", { accommodationId: "a1" });
    await whatsAround("t1", { from: { kind: "stop", id: "s1" }, nearbyKind: "food" });
    expect(m.requireOutsideSurprise).toHaveBeenCalledWith("u1", { stopId: "s1" });
  });

  it("answers over-cap past the daily limit without calling Google", async () => {
    m.takeGoogleQuota.mockResolvedValue(false);
    expect(await whatsAround("t1", acc)).toEqual({ status: "over-cap" });
    expect(m.searchNearby).not.toHaveBeenCalled();
    expect(m.saveNearby).not.toHaveBeenCalled();
  });

  it.each([
    ["accommodation", "accFindUnique"],
    ["stop", "stopFindUnique"],
    ["item", "itemFindUnique"],
  ] as const)("is no-point for another trip's %s", async (kind, mock) => {
    m[mock].mockResolvedValue({ tripId: "other", lat: 1, lng: 2 });
    expect(await whatsAround("t1", { from: { kind, id: "x" }, nearbyKind: "food" })).toEqual({ status: "no-point" });
    expect(m.searchNearby).not.toHaveBeenCalled();
  });

  it("is no-point for a missing row or one that is not located", async () => {
    m.accFindUnique.mockResolvedValue(null);
    expect(await whatsAround("t1", acc)).toEqual({ status: "no-point" });
    m.itemFindUnique.mockResolvedValue({ tripId: "t1", lat: null, lng: null });
    expect(await whatsAround("t1", { from: { kind: "item", id: "i1" }, nearbyKind: "food" })).toEqual({ status: "no-point" });
  });

  it("is no-point for a device point that is not a coordinate", async () => {
    expect(await whatsAround("t1", { from: { kind: "device", lat: 95, lng: 0 }, nearbyKind: "food" })).toEqual({ status: "no-point" });
    expect(await whatsAround("t1", { from: { kind: "device", lat: NaN, lng: 0 }, nearbyKind: "food" })).toEqual({ status: "no-point" });
  });

  it("answers unavailable without a server key, without taking quota", async () => {
    m.hasServerKey.mockReturnValue(false);
    expect(await whatsAround("t1", acc)).toEqual({ status: "unavailable" });
    expect(m.takeGoogleQuota).not.toHaveBeenCalled();
  });

  it("refuses an unknown kind and a caller without access", async () => {
    expect(await whatsAround("t1", { ...acc, nearbyKind: "zoo" as never })).toEqual({ status: "no-point" });
    m.tripFindUnique.mockClear();
    m.requireTripAccess.mockRejectedValueOnce(new Error("NOT_FOUND"));
    await expect(whatsAround("t2", acc)).rejects.toThrow("NOT_FOUND");
    expect(m.tripFindUnique).not.toHaveBeenCalled();
  });
});
