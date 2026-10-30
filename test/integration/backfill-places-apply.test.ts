import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The backfill's --execute against the real Postgres: a planned row is written
// only while it still looks the way the dry run saw it. Only Google is mocked.
vi.mock("@/lib/geocode", () => ({ fetchVenueDetails: vi.fn(async () => null) }));

import { db } from "@/lib/db";
import { fetchVenueDetails } from "@/lib/geocode";
import { applyPlanRow, executePlan, fillItemDetails } from "@/lib/backfill-places-apply";
import type { PlanRow } from "@/lib/backfill-places";

const TRIP_ID = "it-trip-backfill-places";
const STOP_ID = "it-stop-backfill-places";

const row = (over: Partial<PlanRow>): PlanRow => ({
  kind: "item",
  id: "",
  query: "",
  verdict: "accept",
  matched: "venue",
  address: null,
  old: { lat: 35.66, lng: 139.7 },
  set: { lat: 35.6615, lng: 139.7005, placeId: "ChIJVenue", countryCode: "jp" },
  was: { title: "Ichiran", address: "Shibuya" },
  details: false,
  ...over,
});

const quiet = { log: () => undefined, error: () => undefined };

async function item(data: { lat?: number | null; lng?: number | null; placeId?: string | null; link?: string | null }) {
  return db.item.create({ data: { tripId: TRIP_ID, title: "Ichiran", category: "food", address: "Shibuya", ...data } });
}

describe.skipIf(process.env.INTEGRATION !== "1")("backfill places --execute (real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it-user@example.test", name: "It User", isEmailVerified: true } });
    await db.trip.create({ data: { id: TRIP_ID, name: "Backfill trip", homeCurrency: "AUD", createdById: "it-user", members: { create: { userId: "it-user", role: "owner" } } } });
    await db.stop.create({ data: { id: STOP_ID, tripId: TRIP_ID, name: "Bali", country: "Indonesia", sortOrder: 0 } });
  });
  beforeEach(() => vi.mocked(fetchVenueDetails).mockReset());
  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("writes a row that is as the plan saw it, and skips it the second time", async () => {
    const it1 = await item({ lat: 35.66, lng: 139.7 });
    expect(await applyPlanRow(row({ id: it1.id }))).toBe("written");
    expect(await db.item.findUnique({ where: { id: it1.id } })).toMatchObject({ lat: 35.6615, lng: 139.7005, placeId: "ChIJVenue", countryCode: "jp" });
    expect(await applyPlanRow(row({ id: it1.id }))).toBe("changed");
  });

  it("never overwrites a place picked, or a pin moved, since the plan", async () => {
    const picked = await item({ lat: 35.66, lng: 139.7, placeId: "ChIJPicked" });
    expect(await applyPlanRow(row({ id: picked.id }))).toBe("changed");
    expect((await db.item.findUnique({ where: { id: picked.id } }))?.placeId).toBe("ChIJPicked");

    const moved = await item({ lat: 35.7, lng: 139.8 });
    expect(await applyPlanRow(row({ id: moved.id }))).toBe("changed");
    expect(await db.item.findUnique({ where: { id: moved.id } })).toMatchObject({ lat: 35.7, lng: 139.8, placeId: null });
  });

  it("a new row is written only while it still has no point", async () => {
    const fresh = await item({});
    expect(await applyPlanRow(row({ id: fresh.id, verdict: "new", old: null }))).toBe("written");
    const locatedSince = await item({ lat: 1, lng: 2 });
    expect(await applyPlanRow(row({ id: locatedSince.id, verdict: "new", old: null }))).toBe("changed");
  });

  it("a Stop's planned zone lands only while the Stop still has none", async () => {
    const set = { lat: -8.34, lng: 115.09, placeId: "ChIJBali", countryCode: "id", timezone: "Asia/Makassar" };
    expect(await applyPlanRow(row({ kind: "stop", id: STOP_ID, verdict: "new", old: null, set, was: { name: "Bali", country: "Indonesia" } }))).toBe("written");
    expect(await db.stop.findUnique({ where: { id: STOP_ID } })).toMatchObject({ placeId: "ChIJBali", timezone: "Asia/Makassar" });
  });

  it("a Transport end writes only its own columns", async () => {
    const t = await db.transport.create({ data: { tripId: TRIP_ID, mode: "flight", depPlace: "HND", arrPlace: "DPS" } });
    const set = { arrLat: -8.75, arrLng: 115.17, arrPlaceId: "ChIJDps" };
    expect(await applyPlanRow(row({ kind: "transport-arr", id: t.id, verdict: "new", old: null, matched: null, set, was: { arrPlace: "DPS" } }))).toBe("written");
    expect(await db.transport.findUnique({ where: { id: t.id } })).toMatchObject({ arrPlaceId: "ChIJDps", depPlaceId: null, depLat: null });
  });

  it("never overwrites a row whose looked-up text was edited since the plan", async () => {
    const renamed = await item({ lat: 35.66, lng: 139.7 });
    await db.item.update({ where: { id: renamed.id }, data: { title: "Afuri" } });
    expect(await applyPlanRow(row({ id: renamed.id }))).toBe("changed");
    const readdressed = await item({ lat: 35.66, lng: 139.7 });
    await db.item.update({ where: { id: readdressed.id }, data: { address: "Ebisu" } });
    expect(await applyPlanRow(row({ id: readdressed.id }))).toBe("changed");
    expect(await db.item.findUnique({ where: { id: readdressed.id } })).toMatchObject({ placeId: null, lat: 35.66 });

    const t = await db.transport.create({ data: { tripId: TRIP_ID, mode: "flight", arrPlace: "Denpasar" } });
    const set = { arrLat: -8.75, arrLng: 115.17, arrPlaceId: "ChIJDps" };
    expect(await applyPlanRow(row({ kind: "transport-arr", id: t.id, verdict: "new", old: null, matched: null, set, was: { arrPlace: "DPS" } }))).toBe("changed");
  });

  it("re-running a plan retries the details that failed, and only those", async () => {
    const failing = await item({ lat: 35.66, lng: 139.7 });
    const fine = await item({ lat: 35.66, lng: 139.7 });
    const plan = [row({ id: failing.id, details: true }), row({ id: fine.id, details: true })];
    const details = { openingHours: null, website: "https://ichiran.test/", businessStatus: "OPERATIONAL" };
    vi.mocked(fetchVenueDetails).mockResolvedValueOnce(null).mockResolvedValueOnce(details);

    const first = await executePlan(plan, quiet);
    expect(first.failedDetails).toEqual([failing.id]);
    expect(await db.item.findUnique({ where: { id: failing.id } })).toMatchObject({ placeId: "ChIJVenue", businessStatus: null, link: null });

    vi.mocked(fetchVenueDetails).mockResolvedValue(details);
    const second = await executePlan(plan, quiet);
    expect(second.failedDetails).toEqual([]);
    expect(fetchVenueDetails).toHaveBeenCalledTimes(3);
    expect(await db.item.findUnique({ where: { id: failing.id } })).toMatchObject({ businessStatus: "OPERATIONAL", link: "https://ichiran.test/" });
  });

  it("details fill only an empty link, and a failed call reports failed", async () => {
    const withLink = await item({ link: "https://mine.test" });
    vi.mocked(fetchVenueDetails).mockResolvedValueOnce({ openingHours: null, website: "https://google.test", businessStatus: "OPERATIONAL" });
    expect(await fillItemDetails(withLink.id, "ChIJVenue")).toBe("filled");
    expect(await db.item.findUnique({ where: { id: withLink.id } })).toMatchObject({ link: "https://mine.test", businessStatus: "OPERATIONAL" });

    vi.mocked(fetchVenueDetails).mockResolvedValueOnce(null);
    expect(await fillItemDetails(withLink.id, "ChIJVenue")).toBe("failed");
  });
});
