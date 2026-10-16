import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// F4 against the real Postgres. Only the Next/auth boundary, the network
// (geocode, FX) and Activity are mocked; the helper, the actions and Prisma
// run for real (patch-updates.test.ts pattern).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/geocode", () => ({
  geocodePlace: vi.fn(async () => null),
  geocodePlaceDetailed: vi.fn(async () => null),
}));
vi.mock("@/lib/money/fx", () => ({
  resolveRateForTrip: vi.fn(async () => ({ rate: 1, persist: null })),
  persistRate: vi.fn(async () => undefined),
}));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
  requirePlanAccess: vi.fn(async (_t: string, forkId?: string | null) => ({ user: { id: "it-user" }, membership: { role: "owner" }, plan: forkId ?? null })),
  requireRowAccess: vi.fn(async (kind: string, id: string) => {
    const { db } = await import("@/lib/db");
    const { notFound } = await import("next/navigation");
    const delegate = (db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[kind];
    const row = await delegate.findUnique({ where: { id } });
    if (!row) notFound();
    return { row, user: { id: "it-user" }, membership: { role: "owner" }, surpriseOf: null };
  }),
}));
vi.mock("@/lib/surprise-guard", async () => ({
  ...(await vi.importActual<object>("@/lib/surprise-guard")),
  requireOutsideSurprise: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { growTripEndTx } from "@/server/actions/trip-window";

const TRIP_ID = "it-trip-soft-end";
const DATELESS_ID = "it-trip-soft-end-dateless";

/** The spec scenario's Trip: home Brisbane, last Stop Tokyo departing 11 Dec, window ending 11 Dec. */
async function seedTrip(): Promise<{ tokyoId: string }> {
  await db.trip.deleteMany({ where: { id: { in: [TRIP_ID, DATELESS_ID] } } }); // cascades Stops, legs, Forks
  await db.trip.create({
    data: {
      id: TRIP_ID, name: "Soft end IT", homeCurrency: "AUD", createdById: "it-user",
      startDate: "2026-12-01", endDate: "2026-12-11",
      homeName: "Brisbane", homeTimezone: "Australia/Brisbane",
      members: { create: { userId: "it-user", role: "owner" } },
    },
  });
  await db.stop.create({ data: { tripId: TRIP_ID, name: "Osaka", timezone: "Asia/Tokyo", arriveDate: "2026-12-01", departDate: "2026-12-05", sortOrder: 0 } });
  const tokyo = await db.stop.create({ data: { tripId: TRIP_ID, name: "Tokyo", timezone: "Asia/Tokyo", arriveDate: "2026-12-05", departDate: "2026-12-11", sortOrder: 1 } });
  return { tokyoId: tokyo.id };
}

const endDate = async (id = TRIP_ID) => (await db.trip.findUnique({ where: { id }, select: { endDate: true } }))?.endDate;

describe.skipIf(process.env.INTEGRATION !== "1")("soft end date covers the return leg (F4, real Postgres)", () => {
  let tokyoId = "";
  beforeAll(async () => {
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it@example.test", name: "IT" } });
  });
  beforeEach(async () => {
    ({ tokyoId } = await seedTrip());
  });
  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: { in: [TRIP_ID, DATELESS_ID] } } });
  });

  describe("growTripEndTx", () => {
    it("grows endDate to the return leg's landing date in the Home zone, inside a transaction, then is a no-op", async () => {
      await db.transport.create({ data: {
        tripId: TRIP_ID, mode: "FLIGHT", fromStopId: tokyoId, arrIsHome: true,
        depAt: new Date("2026-12-11T13:00:00Z"), arrAt: new Date("2026-12-11T22:30:00Z"),
      } });
      expect(await db.$transaction((tx) => growTripEndTx(tx, TRIP_ID, null))).toBe("2026-12-12");
      expect(await endDate()).toBe("2026-12-12");
      expect(await growTripEndTx(db, TRIP_ID, null)).toBeNull();
    });

    it("never shrinks: an earlier plan leaves a later end alone", async () => {
      await db.trip.update({ where: { id: TRIP_ID }, data: { endDate: "2026-12-20" } });
      expect(await growTripEndTx(db, TRIP_ID, null)).toBeNull();
      expect(await endDate()).toBe("2026-12-20");
    });

    it("reads the real plan only, and does nothing for a Fork", async () => {
      const fork = await db.fork.create({ data: { tripId: TRIP_ID, name: "Plan B", createdById: "it-user" } });
      await db.stop.create({ data: { tripId: TRIP_ID, forkId: fork.id, name: "Kyoto", timezone: "Asia/Tokyo", arriveDate: "2026-12-11", departDate: "2026-12-18", sortOrder: 2 } });
      expect(await growTripEndTx(db, TRIP_ID, fork.id)).toBeNull();
      expect(await growTripEndTx(db, TRIP_ID, null)).toBeNull();
      expect(await endDate()).toBe("2026-12-11");
    });

    it("leaves a date-less Trip date-less", async () => {
      await db.trip.create({ data: { id: DATELESS_ID, name: "Idea", homeCurrency: "AUD", createdById: "it-user", members: { create: { userId: "it-user", role: "owner" } } } });
      await db.stop.create({ data: { tripId: DATELESS_ID, name: "Rome", timezone: "Europe/Rome", arriveDate: "2026-07-01", departDate: "2026-07-04", sortOrder: 0 } });
      expect(await growTripEndTx(db, DATELESS_ID, null)).toBeNull();
      expect(await endDate(DATELESS_ID)).toBeNull();
    });
  });
});
