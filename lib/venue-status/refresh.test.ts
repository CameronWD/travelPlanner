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
import { refreshVenueStatuses } from "./refresh";

const db = realDb as unknown as MockDb<"trip" | "item">;
const NOW = new Date("2026-11-06T12:00:00Z");
const stop = { id: "s1", sortOrder: 0, arriveDate: "2026-11-10", departDate: "2026-11-14", timezone: "Asia/Tokyo" };

function trip(over: Partial<{ startDate: string | null; endDate: string | null }> = {}) {
  return { startDate: "2026-11-10", endDate: "2026-11-14", stops: [stop], ...over };
}
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, placeId: `p${i}` }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  m.takeGoogleQuota.mockResolvedValue(true);
  m.lookUp.mockResolvedValue({ businessStatus: "OPERATIONAL" });
  db.trip.findUnique.mockResolvedValue(trip());
  db.item.findMany.mockResolvedValue([]);
  db.item.update.mockResolvedValue({});
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
    expect(m.takeGoogleQuota).toHaveBeenCalledWith("venue-status", 166);
  });

  it("leaves the row untouched when a lookup fails, and carries on", async () => {
    db.item.findMany.mockResolvedValue(items(2));
    m.lookUp.mockResolvedValueOnce(null).mockResolvedValueOnce({ businessStatus: "CLOSED_PERMANENTLY" });
    expect(await refreshVenueStatuses("t1", NOW)).toEqual({ checked: 1, skippedQuota: false });
    expect(db.item.update).toHaveBeenCalledTimes(1);
    expect(db.item.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { businessStatus: "CLOSED_PERMANENTLY", statusCheckedAt: NOW } });
  });

  it("clears a stale closed status when Google omits it", async () => {
    db.item.findMany.mockResolvedValue(items(1));
    m.lookUp.mockResolvedValue({ businessStatus: null });
    await refreshVenueStatuses("t1", NOW);
    expect(db.item.update).toHaveBeenCalledWith({ where: { id: "i0" }, data: { businessStatus: null, statusCheckedAt: NOW } });
  });

  it("does nothing for a missing Trip", async () => {
    db.trip.findUnique.mockResolvedValue(null);
    expect(await refreshVenueStatuses("t1", NOW)).toEqual({ checked: 0, skippedQuota: false });
  });
});
