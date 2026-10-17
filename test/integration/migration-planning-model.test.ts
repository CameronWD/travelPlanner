import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

// Spec 2026-10-17 R2–R4 against the real Postgres. CI migrates an empty
// database, so this proves the two halves of "existing rows come out right"
// separately: (1) a row inserted WITHOUT the new columns (as every existing
// row is, at migrate time) takes the column defaults; (2) the migration's own
// hand-written backfill, run here narrowed to this test's Trip, marks rows
// with a reference Booked, marks the past (a departed leg, a stay already
// checked into) Booked and held, and leaves everything else alone.
const TRIP_ID = "it-trip-planning-model";
const MIGRATION = "prisma/migrations/20261017120000_planning_model/migration.sql";

function backfillStatements(): string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const begin = sql.indexOf("-- planning-model:backfill:begin");
  const end = sql.indexOf("-- planning-model:backfill:end");
  if (begin < 0 || end < begin) throw new Error("backfill markers missing");
  return sql
    .slice(begin, end)
    .split(";")
    .map((s) => s.replace(/--.*$/gm, "").trim())
    .filter(Boolean)
    .map((s) => `${s} AND "tripId" = '${TRIP_ID}'`);
}

async function states() {
  const [items, transports, accs] = await Promise.all([
    db.item.findMany({ where: { tripId: TRIP_ID }, select: { id: true, bookingState: true, bookingStateSet: true } }),
    db.transport.findMany({ where: { tripId: TRIP_ID }, select: { id: true, bookingState: true, bookingStateSet: true } }),
    db.accommodation.findMany({ where: { tripId: TRIP_ID }, select: { id: true, bookingState: true, bookingStateSet: true } }),
  ]);
  return Object.fromEntries([...items, ...transports, ...accs].map((r) => [r.id, [r.bookingState, r.bookingStateSet]]));
}

describe.skipIf(process.env.INTEGRATION !== "1")("planning model migration (spec 2026-10-17 R2–R4, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it-user@example.test", name: "It User", isEmailVerified: true } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "Planning model", homeCurrency: "AUD", createdById: "it-user", members: { create: { userId: "it-user", role: "owner" } } },
    });
    await db.stop.create({ data: { id: "it-pm-stop", tripId: TRIP_ID, name: "Rome", sortOrder: 0 } });
    // Raw INSERTs that name none of the new columns — the shape of every row
    // that exists when the migration runs.
    await db.$executeRaw`INSERT INTO "Item" ("id", "tripId", "title", "category", "booking", "updatedAt") VALUES
      ('it-pm-item-ref', ${TRIP_ID}, 'Colosseum', 'SIGHTSEEING', 'BK-1', now()),
      ('it-pm-item-blank', ${TRIP_ID}, 'Gelato', 'FOOD', '   ', now()),
      ('it-pm-item-none', ${TRIP_ID}, 'Walk', 'OTHER', NULL, now())`;
    await db.$executeRaw`INSERT INTO "Transport" ("id", "tripId", "mode", "reference", "updatedAt") VALUES
      ('it-pm-leg-ref', ${TRIP_ID}, 'TRAIN', 'FR9521', now()),
      ('it-pm-leg-empty', ${TRIP_ID}, 'TRAIN', '', now()),
      ('it-pm-leg-none', ${TRIP_ID}, 'BUS', NULL, now())`;
    // Day one: a leg that has already departed reads Booked even with no
    // reference; one still to come stays To book.
    await db.$executeRaw`INSERT INTO "Transport" ("id", "tripId", "mode", "reference", "depAt", "updatedAt") VALUES
      ('it-pm-leg-past', ${TRIP_ID}, 'FLIGHT', NULL, '2000-01-01T10:00:00Z', now()),
      ('it-pm-leg-future', ${TRIP_ID}, 'FLIGHT', NULL, '2999-01-01T10:00:00Z', now())`;
    await db.$executeRaw`INSERT INTO "Accommodation" ("id", "tripId", "stopId", "name", "checkIn", "checkOut", "confirmation", "updatedAt") VALUES
      ('it-pm-acc-ref', ${TRIP_ID}, 'it-pm-stop', 'Hotel', '2999-07-01', '2999-07-04', 'ABC123', now()),
      ('it-pm-acc-none', ${TRIP_ID}, 'it-pm-stop', 'Flat', '2999-07-04', '2999-07-06', NULL, now()),
      ('it-pm-acc-past', ${TRIP_ID}, 'it-pm-stop', 'Inn', '2000-07-01', '2000-07-04', NULL, now())`;
    // Tonight's hotel: checked in today (the database's today), so Booked.
    await db.$executeRaw`INSERT INTO "Accommodation" ("id", "tripId", "stopId", "name", "checkIn", "checkOut", "confirmation", "updatedAt") VALUES
      ('it-pm-acc-tonight', ${TRIP_ID}, 'it-pm-stop', 'Tonight', to_char(current_date, 'YYYY-MM-DD'), '2999-01-01', NULL, now())`;
    // Rows a Traveller has already set (written after deploy): the backfill must never touch them.
    await db.$executeRaw`INSERT INTO "Item" ("id", "tripId", "title", "category", "booking", "bookingState", "bookingStateSet", "updatedAt") VALUES
      ('it-pm-item-set', ${TRIP_ID}, 'Opera', 'OTHER', 'X-9', 'TO_BOOK', true, now())`;
    await db.$executeRaw`INSERT INTO "Accommodation" ("id", "tripId", "stopId", "name", "checkIn", "checkOut", "confirmation", "bookingState", "bookingStateSet", "updatedAt") VALUES
      ('it-pm-acc-set', ${TRIP_ID}, 'it-pm-stop', 'Friend', '2000-07-06', '2000-07-07', 'Z', 'NONE', true, now())`;
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("adds every column with its type, nullability and default", async () => {
    const cols = await db.$queryRaw<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]>`
      SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_name IN ('Item', 'Transport', 'Accommodation')
        AND column_name IN ('bookingState', 'bookingStateSet', 'bookBy', 'slotTime', 'arriveByMinutes', 'refundable', 'openingHours')
      ORDER BY table_name, column_name`;
    expect(cols).toEqual([
      { table_name: "Accommodation", column_name: "bookBy", data_type: "text", is_nullable: "YES", column_default: null },
      { table_name: "Accommodation", column_name: "bookingState", data_type: "text", is_nullable: "NO", column_default: "'TO_BOOK'::text" },
      { table_name: "Accommodation", column_name: "bookingStateSet", data_type: "boolean", is_nullable: "NO", column_default: "false" },
      { table_name: "Item", column_name: "arriveByMinutes", data_type: "integer", is_nullable: "YES", column_default: null },
      { table_name: "Item", column_name: "bookBy", data_type: "text", is_nullable: "YES", column_default: null },
      { table_name: "Item", column_name: "bookingState", data_type: "text", is_nullable: "NO", column_default: "'NONE'::text" },
      { table_name: "Item", column_name: "bookingStateSet", data_type: "boolean", is_nullable: "NO", column_default: "false" },
      { table_name: "Item", column_name: "openingHours", data_type: "text", is_nullable: "YES", column_default: null },
      { table_name: "Item", column_name: "refundable", data_type: "boolean", is_nullable: "YES", column_default: null },
      { table_name: "Item", column_name: "slotTime", data_type: "text", is_nullable: "YES", column_default: null },
      { table_name: "Transport", column_name: "bookBy", data_type: "text", is_nullable: "YES", column_default: null },
      { table_name: "Transport", column_name: "bookingState", data_type: "text", is_nullable: "NO", column_default: "'TO_BOOK'::text" },
      { table_name: "Transport", column_name: "bookingStateSet", data_type: "boolean", is_nullable: "NO", column_default: "false" },
    ]);
  });

  it("an existing row takes the defaults: Items need no booking, Transport and Accommodation are To book", async () => {
    expect(await states()).toEqual({
      "it-pm-item-ref": ["NONE", false], "it-pm-item-blank": ["NONE", false], "it-pm-item-none": ["NONE", false],
      "it-pm-item-set": ["TO_BOOK", true],
      "it-pm-leg-ref": ["TO_BOOK", false], "it-pm-leg-empty": ["TO_BOOK", false], "it-pm-leg-none": ["TO_BOOK", false],
      "it-pm-leg-past": ["TO_BOOK", false], "it-pm-leg-future": ["TO_BOOK", false],
      "it-pm-acc-ref": ["TO_BOOK", false], "it-pm-acc-none": ["TO_BOOK", false], "it-pm-acc-set": ["NONE", true],
      "it-pm-acc-past": ["TO_BOOK", false], "it-pm-acc-tonight": ["TO_BOOK", false],
    });
    const item = await db.item.findUniqueOrThrow({ where: { id: "it-pm-item-ref" } });
    expect(item).toMatchObject({ bookBy: null, slotTime: null, arriveByMinutes: null, refundable: null, openingHours: null });
  });

  it("the backfill marks a row with a reference Booked, the past Booked and held, and leaves the rest and Traveller-set rows alone", async () => {
    const statements = backfillStatements();
    expect(statements).toHaveLength(5);
    await db.$transaction(statements.map((s) => db.$executeRawUnsafe(s)));
    const expected = {
      "it-pm-item-ref": ["BOOKED", false], "it-pm-item-blank": ["NONE", false], "it-pm-item-none": ["NONE", false],
      "it-pm-item-set": ["TO_BOOK", true],
      "it-pm-leg-ref": ["BOOKED", false], "it-pm-leg-empty": ["TO_BOOK", false], "it-pm-leg-none": ["TO_BOOK", false],
      "it-pm-leg-past": ["BOOKED", true], "it-pm-leg-future": ["TO_BOOK", false],
      "it-pm-acc-ref": ["BOOKED", false], "it-pm-acc-none": ["TO_BOOK", false], "it-pm-acc-set": ["NONE", true],
      "it-pm-acc-past": ["BOOKED", true], "it-pm-acc-tonight": ["BOOKED", true],
    };
    expect(await states()).toEqual(expected);

    // Idempotent: a second run changes nothing.
    await db.$transaction(backfillStatements().map((s) => db.$executeRawUnsafe(s)));
    expect(await states()).toEqual(expected);
  });
});
