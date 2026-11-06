import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockDb } from "@/test/helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { mockDb } = await import("@/test/helpers/db-mock");
  return { db: mockDb(["trip", "item"]) };
});

const m = vi.hoisted(() => ({
  takeGoogleQuota: vi.fn(async () => true),
  lookUp: vi.fn(),
}));
vi.mock("@/lib/google-usage", () => ({ takeGoogleQuota: m.takeGoogleQuota }));
vi.mock("@/lib/geocode", () => ({ lookUpBusinessStatus: m.lookUp }));

import { db as realDb } from "@/lib/db";
import { refreshVenueStatuses, VENUE_STATUS_DAILY_CAP } from "./refresh";

const db = realDb as unknown as MockDb<"trip" | "item">;
const NOW = new Date("2026-11-06T12:00:00Z");
const stop = { id: "s1", sortOrder: 0, arriveDate: "2026-11-10", departDate: "2026-11-14", timezone: "Asia/Tokyo" };

function trip(over: Partial<{ startDate: string | null; endDate: string | null }> = {}) {
  return { startDate: "2026-11-10", endDate: "2026-11-14", stops: [stop], ...over };
}
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ placeId: `p${i}` }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  m.takeGoogleQuota.mockResolvedValue(true);
  m.lookUp.mockResolvedValue({ businessStatus: "OPERATIONAL" });
  db.trip.findUnique.mockResolvedValue(trip());
  db.item.findMany.mockResolvedValue([]);
  db.item.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => vi.useRealTimers());

describe("refreshVenueStatuses", () => {
  it("selects only venue Items unchecked or checked over 30 days ago, oldest first with nulls first, capped at 20", async () => {
    await refreshVenueStatuses("t1", NOW);
    const arg = db.item.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      tripId: "t1",
      placeId: { not: null },
      OR: [{ statusCheckedAt: null }, { statusCheckedAt: { lt: new Date("2026-10-07T12:00:00Z") } }],
    });
    expect(arg.orderBy).toEqual({ statusCheckedAt: { sort: "asc", nulls: "first" } });
    expect(arg.distinct).toEqual(["placeId"]);
    expect(arg.take).toBe(20);
  });

  it("skips a past Trip without a lookup or a query", async () => {
    db.trip.findUnique.mockResolvedValue(trip({ startDate: "2026-10-01", endDate: "2026-10-05" }));
    expect(await refreshVenueStatuses("t1", NOW)).toEqual({ checked: 0, skippedQuota: false });
    expect(db.item.findMany).not.toHaveBeenCalled();
    expect(m.lookUp).not.toHaveBeenCalled();
  });

  it("checks a Trip that is current or upcoming", async () => {
    db.trip.findUnique.mockResolvedValue(trip({ startDate: "2026-11-01", endDate: "2026-11-30" }));
    db.item.findMany.mockResolvedValue(items(1));
    expect((await refreshVenueStatuses("t1", NOW)).checked).toBe(1);
  });

  it("stops at the first quota refusal", async () => {
    db.item.findMany.mockResolvedValue(items(5));
    m.takeGoogleQuota.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
    expect(await refreshVenueStatuses("t1", NOW)).toEqual({ checked: 2, skippedQuota: true });
    expect(m.lookUp).toHaveBeenCalledTimes(2);
    expect(m.takeGoogleQuota).toHaveBeenCalledTimes(3);
    expect(m.takeGoogleQuota).toHaveBeenCalledWith("venue-status", 80);
  });

  it("leaves the row untouched when a lookup fails, and carries on", async () => {
    db.item.findMany.mockResolvedValue(items(2));
    m.lookUp.mockResolvedValueOnce(null).mockResolvedValueOnce({ businessStatus: "CLOSED_PERMANENTLY" });
    expect(await refreshVenueStatuses("t1", NOW)).toEqual({ checked: 1, skippedQuota: false });
    expect(db.item.updateMany).toHaveBeenCalledTimes(1);
    expect(db.item.updateMany).toHaveBeenCalledWith({ where: { tripId: "t1", placeId: "p1" }, data: { businessStatus: "CLOSED_PERMANENTLY", statusCheckedAt: NOW } });
  });

  it("clears a stale closed status when Google omits it", async () => {
    db.item.findMany.mockResolvedValue(items(1));
    m.lookUp.mockResolvedValue({ businessStatus: null });
    await refreshVenueStatuses("t1", NOW);
    expect(db.item.updateMany).toHaveBeenCalledWith({ where: { tripId: "t1", placeId: "p0" }, data: { businessStatus: null, statusCheckedAt: NOW } });
  });

  it("stamps statusCheckedAt but keeps businessStatus when Google says the place is gone", async () => {
    db.item.findMany.mockResolvedValue(items(1));
    m.lookUp.mockResolvedValue({ notFound: true });
    expect(await refreshVenueStatuses("t1", NOW)).toEqual({ checked: 0, skippedQuota: false });
    expect(db.item.updateMany).toHaveBeenCalledWith({ where: { tripId: "t1", placeId: "p0" }, data: { statusCheckedAt: NOW } });
  });

  it("looks each distinct place up once and writes it across every copy on the Trip", async () => {
    db.item.findMany.mockResolvedValue(items(2));
    await refreshVenueStatuses("t1", NOW);
    expect(m.lookUp).toHaveBeenCalledTimes(2);
    expect(db.item.updateMany.mock.calls[0][0].where).toEqual({ tripId: "t1", placeId: "p0" });
  });

  it("caps the app's daily venue-status budget at 80 even when the configured cap is higher", async () => {
    expect(VENUE_STATUS_DAILY_CAP).toBe(80);
    db.item.findMany.mockResolvedValue(items(1));
    await refreshVenueStatuses("t1", NOW);
    expect(m.takeGoogleQuota).toHaveBeenCalledWith("venue-status", Math.min(166, VENUE_STATUS_DAILY_CAP));
  });

  it("does nothing for a missing Trip", async () => {
    db.trip.findUnique.mockResolvedValue(null);
    expect(await refreshVenueStatuses("t1", NOW)).toEqual({ checked: 0, skippedQuota: false });
  });
});
