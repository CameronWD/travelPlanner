import { describe, it, expect, vi, beforeEach } from "vitest";

// React's cache() only memoises inside a server render; under vitest it is a
// no-op (see the long note in lib/guards.test.ts). This stub gives it
// per-argument memoisation so the test pins OUR wiring: the Day page's three
// getDay calls (day before, day shown, day after) share one loadDayTripData.
const { cacheStore, db } = vi.hoisted(() => ({
  cacheStore: new Map<string, unknown>(),
  db: {
    trip: { findUnique: vi.fn() },
    stop: { findMany: vi.fn() },
    item: { findMany: vi.fn(), groupBy: vi.fn() },
    transport: { findMany: vi.fn() },
    accommodation: { findMany: vi.fn() },
    journalEntry: { findMany: vi.fn() },
    attachment: { findMany: vi.fn() },
    cost: { findMany: vi.fn() },
    dayTitle: { findMany: vi.fn() },
    chapter: { findMany: vi.fn() },
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache:
      <Args extends unknown[], R>(fn: (...args: Args) => R) =>
      (...args: Args): R => {
        const key = JSON.stringify(args);
        if (!cacheStore.has(key)) cacheStore.set(key, fn(...args));
        return cacheStore.get(key) as R;
      },
  };
});
vi.mock("@/lib/db", () => ({ db }));

import { getDay } from "@/lib/day-view-loader";

beforeEach(() => {
  vi.clearAllMocks();
  cacheStore.clear();
  db.trip.findUnique.mockResolvedValue({
    name: "Paris week", startDate: "2026-12-04", endDate: "2026-12-10",
    homeCurrency: "AUD", homeName: "Brisbane", chaptersEnabled: true, roundTrip: true,
  });
  db.stop.findMany.mockResolvedValue([
    { id: "s-paris", name: "Paris", country: "France", countryCode: "FR", timezone: "Europe/Paris", arriveDate: "2026-12-04", departDate: "2026-12-10", sortOrder: 0, lat: 48.8566, lng: 2.3522 },
  ]);
  db.item.findMany.mockResolvedValue([]);
  db.item.groupBy.mockResolvedValue([]);
  db.transport.findMany.mockResolvedValue([]);
  db.accommodation.findMany.mockResolvedValue([]);
  db.journalEntry.findMany.mockResolvedValue([]);
  db.attachment.findMany.mockResolvedValue([]);
  db.cost.findMany.mockResolvedValue([]);
  db.dayTitle.findMany.mockResolvedValue([]);
  db.chapter.findMany.mockResolvedValue([]);
});

describe("the Day page's three getDay calls (spec 2026-10-06 §B)", () => {
  it("issue each trip-wide query once; only the Journal reads are per day", async () => {
    const days = await Promise.all(
      ["2026-12-05", "2026-12-06", "2026-12-07"].map((d) => getDay("trip-1", d, "u-1")),
    );
    expect(days.map((d) => (typeof d === "string" ? d : d.date))).toEqual(["2026-12-05", "2026-12-06", "2026-12-07"]);

    expect(db.trip.findUnique).toHaveBeenCalledTimes(1);
    expect(db.stop.findMany).toHaveBeenCalledTimes(1);
    expect(db.transport.findMany).toHaveBeenCalledTimes(1);
    expect(db.accommodation.findMany).toHaveBeenCalledTimes(1);
    expect(db.cost.findMany).toHaveBeenCalledTimes(1);
    expect(db.chapter.findMany).toHaveBeenCalledTimes(1);
    expect(db.item.groupBy).toHaveBeenCalledTimes(1);
    expect(db.dayTitle.findMany).toHaveBeenCalledTimes(1);
    // Dated Items, Wishlist ideas, things to do — each once, trip-wide.
    expect(db.item.findMany).toHaveBeenCalledTimes(3);
    const tripWideAttachmentReads = db.attachment.findMany.mock.calls.filter(
      ([args]) => (args as { where: { targetType?: string } }).where.targetType !== "JOURNAL",
    );
    expect(tripWideAttachmentReads).toHaveLength(1);
    expect(db.journalEntry.findMany).toHaveBeenCalledTimes(3);
  });

  it("selects Day titles and things to do by the Trip, not by a list of Stop ids", async () => {
    await getDay("trip-1", "2026-12-05", "u-1");
    expect(db.dayTitle.findMany).toHaveBeenCalledWith({
      where: { stop: { tripId: "trip-1", forkId: null } },
      select: { stopId: true, dayIndex: true, title: true },
    });
    expect(db.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1", forkId: null, stopId: { not: null }, date: null } }),
    );
  });
});
