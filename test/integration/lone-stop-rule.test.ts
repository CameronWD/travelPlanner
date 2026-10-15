import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock ONLY the Next/auth boundary — the real actions then run against the
// real Postgres pointed at by DATABASE_URL (same pattern as locking.test.ts).
// deleteStop also takes `isTripOwnerOrAdmin` from `@/lib/guards` (a re-export
// of `@/lib/access`), so the mock passes the real one through.
//
// createStop calls requirePlanAccess and deleteStop (via requireStopAccess)
// calls requireRowAccess("stop", id) (ADR 0074 Tasks 2-6); both mocked here
// (the real guard imports `@/lib/auth`). requireRowAccess loads the Stop
// from the real local Postgres with the same select lib/guards.ts uses.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
  requirePlanAccess: vi.fn(async (_tripId: string, forkId?: string | null) => ({
    user: { id: "it-user" },
    membership: { role: "owner" },
    plan: forkId ?? null,
  })),
  requireRowAccess: vi.fn(async (kind: string, id: string) => {
    const { db } = await import("@/lib/db");
    const { notFound } = await import("next/navigation");
    const STOP_SELECT = {
      id: true, tripId: true, forkId: true, name: true, sortOrder: true,
      arriveDate: true, departDate: true, nights: true, pinned: true, chapterId: true,
    };
    const row = kind === "stop" ? await db.stop.findUnique({ where: { id }, select: STOP_SELECT }) : null;
    if (!row) notFound();
    return { row, user: { id: "it-user" }, membership: { role: "owner" }, surpriseOf: null };
  }),
}));

import { db } from "@/lib/db";
import { createStop, deleteStop } from "@/server/actions/stops";
import { updateTrip } from "@/server/actions/trips";

const TRIP_ID = "it-trip-lone-stop";
const BACKFILL_TRIP_ID = "it-trip-lone-stop-backfill";
const UNDATED_TRIP_ID = "it-trip-lone-stop-undated";
const MIGRATION = path.resolve(
  __dirname,
  "../../prisma/migrations/20261013120000_lone_stop_takes_trip_dates/migration.sql",
);

/** The migration's statement, without its leading comment header. */
function backfillSql(): string {
  return readFileSync(MIGRATION, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .trim();
}

class Rollback extends Error {}

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
    await db.trip.deleteMany({ where: { id: { in: [TRIP_ID, BACKFILL_TRIP_ID, UNDATED_TRIP_ID] } } });
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

  it("moving the Trip a week later carries the lone Stop's dated Items by the same delta", async () => {
    const [stop] = await db.stop.findMany({ where: { tripId: TRIP_ID } });
    expect(stop).toMatchObject({ arriveDate: "2026-11-04", departDate: "2026-11-05" });
    const item = await db.item.create({
      data: { tripId: TRIP_ID, stopId: stop.id, title: "Reef day", category: "ACTIVITY", date: "2026-11-05" },
    });
    const result = await updateTrip(TRIP_ID, {
      name: "Lone Stop IT", startDate: "2026-11-11", endDate: "2026-11-12", homeCurrency: "AUD",
    });
    expect(result.success).toBe(true);
    expect(await db.stop.findUnique({ where: { id: stop.id } })).toMatchObject({
      arriveDate: "2026-11-11", departDate: "2026-11-12",
    });
    expect(await db.item.findUnique({ where: { id: item.id } })).toMatchObject({ stopId: stop.id, date: "2026-11-12" });
  });

  it("the backfill migration schedules only a dated Trip's lone rough Stop, per plan", async () => {
    // Seeded with raw db calls so the app rule never fires.
    await db.trip.deleteMany({ where: { id: { in: [BACKFILL_TRIP_ID, UNDATED_TRIP_ID] } } });
    await db.trip.create({
      data: {
        id: BACKFILL_TRIP_ID,
        name: "Lone Stop backfill IT",
        homeCurrency: "AUD",
        createdById: "it-user",
        startDate: "2026-11-04",
        endDate: "2026-11-05",
        members: { create: { userId: "it-user", role: "owner" } },
      },
    });
    await db.fork.create({ data: { id: "it-fork-lone-stop", tripId: BACKFILL_TRIP_ID, name: "Fork", createdById: "it-user" } });
    await db.trip.create({
      data: {
        id: UNDATED_TRIP_ID,
        name: "Lone Stop undated IT",
        homeCurrency: "AUD",
        createdById: "it-user",
        members: { create: { userId: "it-user", role: "owner" } },
      },
    });
    await db.stop.createMany({
      data: [
        { id: "it-ls-real", tripId: BACKFILL_TRIP_ID, name: "Cairns", sortOrder: 0, nights: 1, timezone: "Australia/Brisbane" },
        { id: "it-ls-fork-0", tripId: BACKFILL_TRIP_ID, forkId: "it-fork-lone-stop", name: "Cairns", sortOrder: 0, nights: 1 },
        { id: "it-ls-fork-1", tripId: BACKFILL_TRIP_ID, forkId: "it-fork-lone-stop", name: "Port Douglas", sortOrder: 1, nights: 2 },
        { id: "it-ls-undated", tripId: UNDATED_TRIP_ID, name: "Somewhere", sortOrder: 0, nights: 3 },
      ],
    });

    // The statement is trip-wide, so run it in a transaction that is rolled
    // back: it must never touch rows this test did not create.
    let affected = -1;
    let after: Awaited<ReturnType<typeof db.stop.findMany>> = [];
    try {
      await db.$transaction(async (tx) => {
        affected = await tx.$executeRawUnsafe(backfillSql());
        after = await tx.stop.findMany({ where: { tripId: { in: [BACKFILL_TRIP_ID, UNDATED_TRIP_ID] } } });
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }

    expect(affected).toBe(1);
    const byId = new Map(after.map((s) => [s.id, s]));
    expect(byId.get("it-ls-real")).toMatchObject({
      arriveDate: "2026-11-04", departDate: "2026-11-05", nights: null, timezone: "Australia/Brisbane",
    });
    for (const id of ["it-ls-fork-0", "it-ls-fork-1"]) {
      expect(byId.get(id)).toMatchObject({ arriveDate: null, departDate: null });
    }
    expect(byId.get("it-ls-fork-1")?.nights).toBe(2);
    expect(byId.get("it-ls-undated")).toMatchObject({ arriveDate: null, departDate: null, nights: 3 });
  });
});
