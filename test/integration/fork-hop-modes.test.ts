import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: () => { throw new Error("REDIRECT"); } }));
vi.mock("@/lib/guards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/guards")>("@/lib/guards");
  const user = { id: "it-fhm-user", email: "it-fhm@example.test" };
  return {
    ...actual,
    requireUser: vi.fn(async () => user),
    assertForkingAllowed: vi.fn(),
    requireTripAccess: vi.fn(async () => ({ user, membership: { role: "owner" } })),
    requireForkAccess: vi.fn(async (forkId: string) => {
      const { db } = await import("@/lib/db");
      const fork = await db.fork.findUniqueOrThrow({
        where: { id: forkId },
        select: { id: true, tripId: true, name: true, trip: { select: { id: true, startDate: true, endDate: true, forksEnabled: true } } },
      });
      return { user, fork, trip: fork.trip };
    }),
  };
});

import { db } from "@/lib/db";
import { createFork, getComparison, promoteFork } from "@/server/actions/forks";
import { pointKey } from "@/lib/travel-times/hops";

vi.mock("@/lib/what-if", () => ({ WHAT_IF_PLANS_HIDDEN: false }));

const USER = "it-fhm-user";
const TRIP_ID = "it-fhm-trip";
const A = { lat: 35.71477, lng: 139.79666 };
const B = { lat: 35.7056, lng: 139.7967 };
const WALK_KEY = `WALK|${pointKey(A)}|${pointKey(B)}`;

describe.skipIf(process.env.INTEGRATION !== "1")("Hop modes across What-if plans (real Postgres)", () => {
  let realA = "";
  let realB = "";

  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "it-fhm@example.test", name: "IT FHM" } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.travelTime.deleteMany({ where: { key: WALK_KEY } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Hop modes", homeCurrency: "AUD", createdById: USER, forksEnabled: true,
        startDate: "2099-06-01", endDate: "2099-06-07", homeTimezone: "Asia/Tokyo",
        members: { create: { userId: USER, role: "owner" } },
      },
    });
    const stop = await db.stop.create({
      data: { tripId: TRIP_ID, name: "IT Tokyo", timezone: "Asia/Tokyo", lat: A.lat, lng: A.lng, arriveDate: "2099-06-01", departDate: "2099-06-07", nights: 6, sortOrder: 0 },
    });
    const item = (title: string, at: typeof A, startTime: string, endTime: string, sortOrder: number) =>
      db.item.create({
        data: { tripId: TRIP_ID, stopId: stop.id, title, category: "SIGHTSEEING", date: "2099-06-02", startTime, endTime, lat: at.lat, lng: at.lng, sortOrder },
      });
    realA = (await item("IT A", A, "10:00", "12:00", 0)).id;
    realB = (await item("IT B", B, "12:20", "13:30", 1)).id;
    await db.travelTime.create({ data: { key: WALK_KEY, mode: "WALK", status: "OK", minutes: 118, distanceM: 9000 } });
    await db.hopMode.create({ data: { tripId: TRIP_ID, fromItemId: realA, toItemId: realB, mode: "WALK", setById: USER } });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.travelTime.deleteMany({ where: { key: WALK_KEY } });
  });

  it("a new What-if plan copies the Hop mode onto its own Items, Compare sees no Flag difference, and promoting keeps it", async () => {
    const created = await createFork(TRIP_ID, "IT Plan B");
    expect(created).toMatchObject({ success: true });
    const { forkId } = created as { forkId: string };

    const forkItems = await db.item.findMany({ where: { tripId: TRIP_ID, forkId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    expect(forkItems).toHaveLength(2);
    const copied = await db.hopMode.findMany({ where: { fromItemId: forkItems[0].id, toItemId: forkItems[1].id } });
    expect(copied).toEqual([expect.objectContaining({ mode: "WALK", tripId: TRIP_ID, setById: USER })]);

    const cmp = await getComparison(TRIP_ID);
    const real = cmp.plans.find((p) => p.forkId === null)!.metrics.flagCounts;
    const fork = cmp.plans.find((p) => p.forkId === forkId)!.metrics.flagCounts;
    expect(real.warning).toBeGreaterThan(0); // the forced 118 min walk is tight
    expect(fork).toEqual(real);

    expect(await promoteFork(forkId)).toEqual({ success: true });
    const after = await db.hopMode.findMany({ where: { tripId: TRIP_ID } });
    expect(after).toHaveLength(1);
    const promoted = await db.item.findMany({ where: { tripId: TRIP_ID, forkId: null, id: { in: [after[0].fromItemId, after[0].toItemId] } } });
    expect(promoted).toHaveLength(2);
  });
});
