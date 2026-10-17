import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

// Real Postgres (npm run test:integration), spec 2026-10-16 F8: a Reminder
// carries optional notes and is about at most one thing — a Stop, an Item
// or a Transport leg. Prisma cannot express the CHECK, so the migration is
// hand-written; this pins that it exists and bites.
const OWNER = "it-ra-owner";
const TRIP_ID = "it-ra-trip";

describe.skipIf(process.env.INTEGRATION !== "1")("Reminder about one thing (real Postgres, F8)", () => {
  let stopId = "";
  let itemId = "";
  let transportId = "";

  beforeAll(async () => {
    await db.user.upsert({ where: { id: OWNER }, update: {}, create: { id: OWNER, email: "ra-owner@example.test", name: "RA Owner" } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "IT Reminder about", homeCurrency: "AUD", createdById: OWNER, members: { create: { userId: OWNER, role: "owner" } } },
    });
    stopId = (await db.stop.create({ data: { tripId: TRIP_ID, name: "IT Lyon", sortOrder: 0 } })).id;
    itemId = (await db.item.create({ data: { tripId: TRIP_ID, title: "IT Bouchon dinner", category: "OTHER" } })).id;
    transportId = (await db.transport.create({ data: { tripId: TRIP_ID, mode: "TRAIN", depPlace: "Paris", arrPlace: "Lyon" } })).id;
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the CHECK constraint exists", async () => {
    const rows = await db.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname = 'Reminder_about_one_thing_check'`;
    expect(rows).toHaveLength(1);
  });

  it("a Reminder holds notes and is about an Item, or a Transport leg", async () => {
    const a = await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT Book table", date: "2027-01-02", notes: "Ask for the window", itemId } });
    const b = await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT Seats", date: "2027-01-01", transportId } });
    expect(await db.reminder.findUnique({ where: { id: a.id } })).toMatchObject({ notes: "Ask for the window", itemId, stopId: null, transportId: null });
    expect(await db.reminder.findUnique({ where: { id: b.id } })).toMatchObject({ notes: null, transportId, itemId: null });
  });

  it("refuses a Reminder about two things", async () => {
    await expect(
      db.reminder.create({ data: { tripId: TRIP_ID, title: "IT Two things", date: "2027-01-03", stopId, itemId } }),
    ).rejects.toThrow();
    const r = await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT One thing", date: "2027-01-03", stopId } });
    await expect(db.reminder.update({ where: { id: r.id }, data: { transportId } })).rejects.toThrow();
    expect(await db.reminder.count({ where: { tripId: TRIP_ID, title: "IT Two things" } })).toBe(0);
  });

  it("deleting the Item or the leg leaves the Reminder about nothing", async () => {
    const it1 = await db.item.create({ data: { tripId: TRIP_ID, title: "IT Doomed", category: "OTHER" } });
    const leg = await db.transport.create({ data: { tripId: TRIP_ID, mode: "BUS" } });
    const r1 = await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT About doomed item", date: "2027-01-04", itemId: it1.id } });
    const r2 = await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT About doomed leg", date: "2027-01-04", transportId: leg.id } });
    await db.item.delete({ where: { id: it1.id } });
    await db.transport.delete({ where: { id: leg.id } });
    expect(await db.reminder.findUnique({ where: { id: r1.id } })).toMatchObject({ itemId: null, title: "IT About doomed item" });
    expect(await db.reminder.findUnique({ where: { id: r2.id } })).toMatchObject({ transportId: null });
  });
});
