import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The TravelTime store and the refresh against the real Postgres. Only Google and its daily counter are mocked.
const m = vi.hoisted(() => ({ computeRoute: vi.fn(), hasServerKey: vi.fn(() => true) }));
vi.mock("@/lib/routes", () => ({ computeRoute: m.computeRoute }));
vi.mock("@/lib/google-fetch", () => ({ hasServerKey: m.hasServerKey }));
vi.mock("@/lib/google-usage", () => ({ takeGoogleQuota: vi.fn(async () => true) }));

import { db } from "@/lib/db";
import { loadTravelTimes, saveTravelTime, settledTravelKeys } from "@/lib/travel-times/store";
import { refreshTripTravelTimes } from "@/lib/travel-times/refresh";
import { driveKey } from "@/lib/travel-times/hops";

const PREFIX = "WALK|-89.00001,";
const key = (n: number) => `${PREFIX}0.0000${n}|-89.00002,0.00000`;
const TRIP_ID = "it-trip-travel-times";
const USER = "it-travel-times-user";
const A = { lat: -45.1, lng: 170.1 };
const B = { lat: -45.2, lng: 170.3 };
const NOW = new Date("2026-11-01T00:00:00Z");

async function clean() {
  await db.travelTime.deleteMany({ where: { OR: [{ key: { startsWith: PREFIX } }, { key: driveKey(A, B) }] } });
}

describe.skipIf(process.env.INTEGRATION !== "1")("TravelTime store (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "it-travel-times@example.test", name: "It Travel", isEmailVerified: true } });
  });
  beforeEach(async () => {
    await clean();
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    m.computeRoute.mockReset();
  });
  afterAll(async () => {
    await clean();
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("upserts idempotently and moves fetchedAt on an overwrite", async () => {
    await saveTravelTime(key(1), { mode: "WALK", status: "ERROR", minutes: null, distanceM: null, polyline: null });
    const first = await db.travelTime.findUniqueOrThrow({ where: { key: key(1) } });
    await new Promise((r) => setTimeout(r, 5));
    await saveTravelTime(key(1), { mode: "WALK", status: "OK", minutes: 12, distanceM: 900, polyline: "xyz" });
    await saveTravelTime(key(1), { mode: "WALK", status: "OK", minutes: 12, distanceM: 900, polyline: "xyz" });

    const rows = await db.travelTime.findMany({ where: { key: key(1) } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "OK", minutes: 12, distanceM: 900, polyline: "xyz" });
    expect(rows[0].fetchedAt.getTime()).toBeGreaterThan(first.fetchedAt.getTime());

    const lookup = await loadTravelTimes([key(1), key(2)]);
    expect([...lookup.entries()]).toEqual([[key(1), { status: "OK", minutes: 12, distanceM: 900, polyline: "xyz" }]]);
  });

  it("concurrent upserts of the same key don't throw and leave one row", async () => {
    await expect(
      Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          saveTravelTime(key(3), { mode: "WALK", status: "OK", minutes: i, distanceM: 100, polyline: null }),
        ),
      ),
    ).resolves.toBeDefined();
    expect(await db.travelTime.count({ where: { key: key(3) } })).toBe(1);
  });

  it("an ERROR younger than 24 h is settled, an older one is not", async () => {
    await saveTravelTime(key(4), { mode: "WALK", status: "ERROR", minutes: null, distanceM: null, polyline: null });
    await saveTravelTime(key(5), { mode: "WALK", status: "NONE", minutes: null, distanceM: null, polyline: null });
    const now = new Date();
    expect(await settledTravelKeys([key(4), key(5), key(6)], now)).toEqual(new Set([key(4), key(5)]));
    const tomorrow = new Date(now.getTime() + 25 * 3600_000);
    expect(await settledTravelKeys([key(4), key(5)], tomorrow)).toEqual(new Set([key(5)]));
  });

  it("refreshes a real Trip's car leg once, then finds it stored", async () => {
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Travel times", homeCurrency: "AUD", createdById: USER,
        members: { create: { userId: USER, role: "owner" } },
        stops: {
          create: [
            { id: `${TRIP_ID}-a`, name: "A", sortOrder: 0, lat: A.lat, lng: A.lng, timezone: "Pacific/Auckland" },
            { id: `${TRIP_ID}-b`, name: "B", sortOrder: 1, lat: B.lat, lng: B.lng, timezone: "Pacific/Auckland" },
          ],
        },
      },
    });
    await db.transport.create({ data: { tripId: TRIP_ID, mode: "CAR", fromStopId: `${TRIP_ID}-a`, toStopId: `${TRIP_ID}-b` } });
    m.computeRoute.mockResolvedValue({ status: "ok", minutes: 25, distanceM: 21000, polyline: "car" });

    expect(await refreshTripTravelTimes(TRIP_ID, { now: NOW })).toEqual({ wanted: 1, fetched: 1, skippedQuota: 0, failed: 0 });
    expect(await refreshTripTravelTimes(TRIP_ID, { now: NOW })).toEqual({ wanted: 0, fetched: 0, skippedQuota: 0, failed: 0 });
    expect(m.computeRoute).toHaveBeenCalledTimes(1);
    expect(await db.travelTime.findUnique({ where: { key: driveKey(A, B) } })).toMatchObject({ mode: "DRIVE", status: "OK", minutes: 25 });
  });
});
