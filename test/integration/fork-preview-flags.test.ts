import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The promote dialog's Flag delta (getPromotionPreview) must read Travel times
// exactly as Compare (getComparison) does, Home-end car legs included.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: () => { throw new Error("REDIRECT"); } }));
vi.mock("@/lib/guards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/guards")>("@/lib/guards");
  const user = { id: "it-fpf-user", email: "it-fpf@example.test" };
  return {
    ...actual,
    requireUser: vi.fn(async () => user),
    requireTripAccess: vi.fn(async () => ({ user, membership: { role: "owner" } })),
    requireForkAccess: vi.fn(async (forkId: string) => ({ user, fork: { id: forkId, tripId: "it-fpf-trip", name: "IT Plan B" } })),
  };
});

import { db } from "@/lib/db";
import { getComparison, getPromotionPreview } from "@/server/actions/forks";
import { driveKey, hopKeys } from "@/lib/travel-times/hops";

const USER = "it-fpf-user";
const TRIP_ID = "it-fpf-trip";
const FORK_ID = "it-fpf-fork";
const HOME = { lat: 37.5665, lng: 126.978 };
const TEMPLE = { lat: 35.71477, lng: 139.79666 };
const BAR = { lat: 35.7056, lng: 139.7967 };
const NOW = new Date();
const keys = [...hopKeys(TEMPLE, BAR, "DRIVE", null, NOW), driveKey(HOME, TEMPLE)];

describe.skipIf(process.env.INTEGRATION !== "1")("getPromotionPreview counts Flags as Compare does (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "it-fpf@example.test", name: "IT FPF" } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.travelTime.deleteMany({ where: { key: { in: keys } } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Preview flags", homeCurrency: "AUD", createdById: USER, forksEnabled: true,
        startDate: "2027-06-01", endDate: "2027-06-07", homeName: "Seoul", homeLat: HOME.lat, homeLng: HOME.lng, homeTimezone: "Asia/Seoul",
        members: { create: { userId: USER, role: "owner" } },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", sortOrder: 0, createdById: USER } });
    for (const forkId of [null, FORK_ID]) {
      await db.stop.create({
        data: {
          id: `it-fpf-tokyo-${forkId ?? "real"}`, tripId: TRIP_ID, forkId, name: "IT Tokyo", timezone: "Asia/Tokyo",
          lat: TEMPLE.lat, lng: TEMPLE.lng, arriveDate: "2027-06-01", departDate: "2027-06-07", nights: 6, sortOrder: 0,
        },
      });
    }
    const tokyo = `it-fpf-tokyo-${FORK_ID}`;
    await db.transport.create({ data: { tripId: TRIP_ID, forkId: FORK_ID, mode: "CAR", depIsHome: true, toStopId: tokyo, sortOrder: 0 } });
    await db.item.createMany({
      data: [
        { tripId: TRIP_ID, forkId: FORK_ID, stopId: tokyo, title: "IT Temple", category: "SIGHTSEEING", date: "2027-06-02", startTime: "10:00", endTime: "12:00", lat: TEMPLE.lat, lng: TEMPLE.lng, sortOrder: 0 },
        { tripId: TRIP_ID, forkId: FORK_ID, stopId: tokyo, title: "IT Bar", category: "FOOD", date: "2027-06-02", startTime: "12:30", endTime: "13:30", lat: BAR.lat, lng: BAR.lng, sortOrder: 1 },
      ],
    });
    const walkKey = keys.find((k) => k.startsWith("WALK|"))!;
    await db.travelTime.createMany({
      data: [
        { key: walkKey, mode: "WALK", status: "OK", minutes: 20, distanceM: 1100 },
        { key: driveKey(HOME, TEMPLE), mode: "DRIVE", status: "OK", minutes: 1500, distanceM: 1_200_000 },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.travelTime.deleteMany({ where: { key: { in: keys } } });
  });

  async function deltas() {
    const comparison = await getComparison(TRIP_ID);
    const real = comparison.plans.find((p) => p.forkId === null)!.metrics.flagCounts;
    const fork = comparison.plans.find((p) => p.forkId === FORK_ID)!.metrics.flagCounts;
    const preview = (await getPromotionPreview(FORK_ID)).deltas;
    return {
      compare: { warnings: fork.warning - real.warning, infos: fork.info - real.info },
      preview: { warnings: preview.flagWarnings, infos: preview.flagInfos },
    };
  }

  it("the preview's Flag delta equals Compare's for the same Fork, with and without the stored rows", async () => {
    const stored = await deltas();
    expect(stored.preview).toEqual(stored.compare);

    // Without the stored 20-min walk the ~13-min estimate leaves the 30-min gap comfortable: one fewer info Flag.
    await db.travelTime.deleteMany({ where: { key: { startsWith: "WALK|" }, AND: { key: { in: keys } } } });
    const estimated = await deltas();
    expect(estimated.preview).toEqual(estimated.compare);
    expect(estimated.compare.infos).toBe(stored.compare.infos - 1);
  });
});
