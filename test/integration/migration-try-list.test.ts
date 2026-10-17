import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

// CONTEXT.md "Try list" (spec 2026-10-17 R6) against the real Postgres: the
// column exists as nullable text with no default, and a row written without it
// (every row that exists when the migration runs) has no list.
const TRIP_ID = "it-trip-try-list-migration";

describe.skipIf(process.env.INTEGRATION !== "1")("Item.tryList migration (spec 2026-10-17 R6, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it-user@example.test", name: "It User", isEmailVerified: true } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "Try list migration", homeCurrency: "AUD", createdById: "it-user", members: { create: { userId: "it-user", role: "owner" } } },
    });
    await db.$executeRaw`INSERT INTO "Item" ("id", "tripId", "title", "category", "updatedAt") VALUES
      ('it-tl-item-old', ${TRIP_ID}, 'Christkindlesmarkt', 'FOOD', now())`;
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("adds Item.tryList as nullable text with no default", async () => {
    const cols = await db.$queryRaw<{ data_type: string; is_nullable: string; column_default: string | null }[]>`
      SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'Item' AND column_name = 'tryList'`;
    expect(cols).toEqual([{ data_type: "text", is_nullable: "YES", column_default: null }]);
  });

  it("an existing row has no list, and a written list reads back verbatim", async () => {
    expect(await db.item.findUniqueOrThrow({ where: { id: "it-tl-item-old" }, select: { tryList: true } })).toEqual({ tryList: null });
    const stored = JSON.stringify([{ id: "abcd1234", text: "Lebkuchen", tried: true }]);
    await db.item.update({ where: { id: "it-tl-item-old" }, data: { tryList: stored } });
    expect(await db.item.findUniqueOrThrow({ where: { id: "it-tl-item-old" }, select: { tryList: true } })).toEqual({ tryList: stored });
  });
});
