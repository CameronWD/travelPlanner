import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock ONLY the Next/auth boundary — the real actions then run against the
// real Postgres pointed at by DATABASE_URL (same pattern as locking.test.ts).
// deleteStop also takes `isTripOwnerOrAdmin` from `@/lib/guards` (a re-export
// of `@/lib/access`), so the mock passes the real one through.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
}));

import { db } from "@/lib/db";
import { createStop, deleteStop } from "@/server/actions/stops";

const TRIP_ID = "it-trip-lone-stop";

describe.skipIf(process.env.INTEGRATION !== "1")("lone Stop rule end to end (ADR 0073)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it@example.test", name: "IT" } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } }); // cascades stops
    await db.trip.create({
      data: {
        id: TRIP_ID,
        name: "Lone Stop IT",
        homeCurrency: "AUD",
        createdById: "it-user",
        startDate: "2026-11-04",
        endDate: "2026-11-05",
        members: { create: { userId: "it-user", role: "owner" } },
      },
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the first rough Stop on a dated Trip is scheduled to the Trip's dates", async () => {
    const result = await createStop(TRIP_ID, { mode: "rough", name: "Crystalbrook Flynn Cairns", country: "Australia", nights: 1 });
    expect(result.success).toBe(true);
    const stops = await db.stop.findMany({ where: { tripId: TRIP_ID } });
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({ arriveDate: "2026-11-04", departDate: "2026-11-05", nights: null });
  });

  it("a second Stop may be rough; deleting the first schedules the survivor", async () => {
    const created = await createStop(TRIP_ID, { mode: "rough", name: "Port Douglas", nights: 2 });
    expect(created.success).toBe(true);
    const [first, second] = await db.stop.findMany({ where: { tripId: TRIP_ID }, orderBy: { sortOrder: "asc" } });
    expect(second.arriveDate).toBeNull();
    const deleted = await deleteStop(first.id);
    expect(deleted.success).toBe(true);
    const survivor = await db.stop.findUnique({ where: { id: second.id } });
    expect(survivor).toMatchObject({ arriveDate: "2026-11-04", departDate: "2026-11-05" });
  });
});
