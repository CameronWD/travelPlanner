import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// F5 against the real Postgres: a Home timezone change keeps every Home-end
// time's local wall-clock time, in the real plan and every Fork, and moves
// nothing else. Only the Next/auth boundary, the network and Activity are mocked.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: vi.fn() }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: vi.fn(async () => null), geocodePlaceDetailed: vi.fn(async () => null) }));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
}));

import { db } from "@/lib/db";
import { recordActivity } from "@/lib/activity-record";
import { updateTrip } from "@/server/actions/trips";
import { instantToZonedTime, zonedWallTimeToInstant } from "@/lib/tz";

const TRIP_ID = "it-trip-home-tz";
const FORK_ID = "it-fork-home-tz";
const SYD = "Australia/Sydney";
const BNE = "Australia/Brisbane";
const LIS = "Europe/Lisbon";
const at = (d: string, t: string, z: string) => zonedWallTimeToInstant(d, t, z);

describe.skipIf(process.env.INTEGRATION !== "1")("a Home timezone change keeps Home-end local times (F5, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it-user@example.test", name: "It User", isEmailVerified: true } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "Home zone trip", homeCurrency: "AUD", startDate: "2026-12-10", endDate: "2026-12-26",
        homeName: "Gold Coast", homeCountryCode: "au", homeTimezone: SYD, createdById: "it-user",
        members: { create: { userId: "it-user", role: "owner" } },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "Longer Lisbon", createdById: "it-user" } });
    await db.stop.createMany({
      data: [
        { id: "it-htz-lis", tripId: TRIP_ID, name: "Lisbon", timezone: LIS, arriveDate: "2026-12-11", departDate: "2026-12-24", nights: 13, sortOrder: 0 },
        { id: "it-htz-lis-fork", tripId: TRIP_ID, forkId: FORK_ID, name: "Lisbon", timezone: LIS, arriveDate: "2026-12-11", departDate: "2026-12-25", nights: 14, sortOrder: 0 },
      ],
    });
    await db.transport.createMany({
      data: [
        // Real plan: outbound (Home → Lisbon), return (Lisbon → Home), and a non-Home leg.
        { id: "it-htz-out", tripId: TRIP_ID, mode: "FLIGHT", depIsHome: true, toStopId: "it-htz-lis", depAt: at("2026-12-10", "06:10", SYD), arrAt: at("2026-12-11", "07:15", LIS), sortOrder: 0 },
        { id: "it-htz-ret", tripId: TRIP_ID, mode: "FLIGHT", arrIsHome: true, fromStopId: "it-htz-lis", depAt: at("2026-12-24", "09:00", LIS), arrAt: at("2026-12-25", "21:40", SYD), sortOrder: 1 },
        { id: "it-htz-other", tripId: TRIP_ID, mode: "TRAIN", fromStopId: "it-htz-lis", depAt: at("2026-12-15", "10:00", LIS), sortOrder: 2 },
        // Fork: a return leg with no departure time yet.
        { id: "it-htz-fork-ret", tripId: TRIP_ID, forkId: FORK_ID, mode: "FLIGHT", arrIsHome: true, fromStopId: "it-htz-lis-fork", depAt: null, arrAt: at("2026-12-26", "05:30", SYD), sortOrder: 0 },
      ],
    });
  });
  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("Sydney → Brisbane keeps every Home-end local time, real plan and Fork; nothing else moves", async () => {
    expect(await updateTrip(TRIP_ID, { homeTimezone: BNE })).toMatchObject({ success: true });

    const rows = new Map((await db.transport.findMany({ where: { tripId: TRIP_ID } })).map((t) => [t.id, t]));
    const out = rows.get("it-htz-out")!;
    expect(out.depAt).toEqual(at("2026-12-10", "06:10", BNE));
    expect(out.depAt!.toISOString()).toBe("2026-12-09T20:10:00.000Z"); // +1h: Sydney was on daylight time
    expect(instantToZonedTime(out.depAt!, BNE)).toBe("06:10");
    expect(out.arrAt).toEqual(at("2026-12-11", "07:15", LIS)); // the Lisbon end is untouched

    const ret = rows.get("it-htz-ret")!;
    expect(ret.depAt).toEqual(at("2026-12-24", "09:00", LIS));
    expect(ret.arrAt).toEqual(at("2026-12-25", "21:40", BNE));

    const forkRet = rows.get("it-htz-fork-ret")!;
    expect(forkRet.depAt).toBeNull();
    expect(forkRet.arrAt).toEqual(at("2026-12-26", "05:30", BNE));

    expect(rows.get("it-htz-other")!.depAt).toEqual(at("2026-12-15", "10:00", LIS));

    expect((await db.trip.findUnique({ where: { id: TRIP_ID }, select: { homeTimezone: true } }))!.homeTimezone).toBe(BNE);
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({
      tripId: TRIP_ID,
      changes: { summary: "changed the Home timezone to Australia/Brisbane; Home-end times kept as local times" },
    }));
  });

  it("saving the same zone again moves nothing", async () => {
    const before = await db.transport.findMany({ where: { tripId: TRIP_ID }, orderBy: { id: "asc" } });
    await updateTrip(TRIP_ID, { homeTimezone: BNE });
    const after = await db.transport.findMany({ where: { tripId: TRIP_ID }, orderBy: { id: "asc" } });
    expect(after.map((t) => [t.id, t.depAt, t.arrAt])).toEqual(before.map((t) => [t.id, t.depAt, t.arrAt]));
  });
});
