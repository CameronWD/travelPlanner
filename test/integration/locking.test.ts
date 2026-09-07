import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock ONLY the Next/auth boundary — the real actions then run against the
// real Postgres pointed at by DATABASE_URL (CI service container or local
// docker-compose).
//
// `@/lib/guards` exports only `requireUser` and `requireTripAccess`. The
// per-entity guards (`requireStopAccess` in server/actions/stops.ts,
// `requireTransportAccess` in server/actions/transport.ts) are private
// module-level functions in those files, NOT re-exports of `@/lib/guards` —
// they run for real against the seeded rows below.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/guards", () => ({
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
}));

import { db } from "@/lib/db";
import { moveStop, reorderStops } from "@/server/actions/stops";
import { reorderTransports } from "@/server/actions/transport";

const TRIP_ID = "it-trip-locking";

describe.skipIf(process.env.INTEGRATION !== "1")("reorder locking (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it@example.test", name: "IT" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } }); // cascades stops/transports
    await db.trip.create({
      data: {
        id: TRIP_ID,
        name: "Locking IT",
        homeCurrency: "AUD",
        createdById: "it-user",
        members: { create: { userId: "it-user", role: "owner" } },
      },
    });
    await db.stop.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        id: `it-stop-${i}`, tripId: TRIP_ID, name: `Stop ${i}`, sortOrder: i,
      })),
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("concurrent moveStop + reorderStops never deadlock and leave a valid permutation", async () => {
    for (let round = 0; round < 10; round++) {
      const reversed = (await db.stop.findMany({ where: { tripId: TRIP_ID }, orderBy: { sortOrder: "asc" } }))
        .reverse()
        .map((s) => ({ id: s.id, chapterId: null }));
      const results = await Promise.all([
        reorderStops(TRIP_ID, reversed, undefined),
        moveStop("it-stop-2", "up"),
        moveStop("it-stop-4", "down"),
      ]);
      for (const r of results) expect(r.success).toBe(true); // no 40P01 deadlock abort
      const after = await db.stop.findMany({ where: { tripId: TRIP_ID }, orderBy: { sortOrder: "asc" } });
      expect(new Set(after.map((s) => s.sortOrder)).size).toBe(6); // distinct, no scramble
    }
  });

  it("concurrent reorderTransports serialize instead of interleaving", async () => {
    await db.transport.createMany({
      data: Array.from({ length: 4 }, (_, i) => ({
        id: `it-tr-${i}`, tripId: TRIP_ID, mode: "TRAIN", sortOrder: i,
      })),
    });
    const orderA = [0, 1, 2, 3].map((i, idx) => ({ id: `it-tr-${i}`, anchorStopId: null, sortOrder: idx }));
    const orderB = [3, 2, 1, 0].map((i, idx) => ({ id: `it-tr-${i}`, anchorStopId: null, sortOrder: idx }));
    for (let round = 0; round < 10; round++) {
      await Promise.all([reorderTransports(TRIP_ID, orderA), reorderTransports(TRIP_ID, orderB)]);
      const after = await db.transport.findMany({ where: { tripId: TRIP_ID }, orderBy: { sortOrder: "asc" } });
      // One writer won wholesale: the result is exactly orderA or orderB,
      // never an interleaving with duplicate/missing sortOrders.
      expect(after.map((t) => t.sortOrder)).toEqual([0, 1, 2, 3]);
      const ids = after.map((t) => t.id).join(",");
      expect([orderA, orderB].map((o) => [...o].sort((x, y) => x.sortOrder - y.sortOrder).map((x) => x.id).join(","))).toContain(ids);
    }
  });
});
