import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ id: "it-rem-owner" }));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(async () => ({ user: { id: viewer.id }, membership: { role: "owner" } })),
}));

import { db } from "@/lib/db";
import { listRemindersForTrip } from "@/lib/reminder-reads";

// Real Postgres (npm run test:integration): the Reminders read moved out of
// server/actions/reminders.ts (card 3.N), with the real Surprise visibility
// loader — a Reminder about a Stop hidden from the viewer stays hidden (ADR 0051).
const OWNER = "it-rem-owner";
const MEMBER = "it-rem-member";
const TRIP_ID = "it-rem-trip";
const SECRET = "it-rem-secret";

describe.skipIf(process.env.INTEGRATION !== "1")("listRemindersForTrip (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: OWNER }, update: {}, create: { id: OWNER, email: "rem-owner@example.test", name: "Rem Owner" } });
    await db.user.upsert({ where: { id: MEMBER }, update: {}, create: { id: MEMBER, email: "rem-member@example.test", name: "Rem Member" } });
  });

  beforeEach(async () => {
    viewer.id = OWNER;
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Reminders", homeCurrency: "AUD", createdById: OWNER,
        startDate: "2027-06-01", endDate: "2027-06-07",
        members: { create: [{ userId: OWNER, role: "owner" }, { userId: MEMBER, role: "member" }] },
      },
    });
    await db.stop.createMany({
      data: [
        { id: "it-rem-porto", tripId: TRIP_ID, name: "IT Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-04", nights: 3, sortOrder: 0 },
        { id: SECRET, tripId: TRIP_ID, name: "IT Secret", timezone: "Europe/Lisbon", arriveDate: "2027-06-04", departDate: "2027-06-07", nights: 3, sortOrder: 1,
          surprisePlannerId: OWNER, surpriseForIds: JSON.stringify([MEMBER]) },
      ],
    });
    await db.reminder.createMany({
      data: [
        { tripId: TRIP_ID, title: "IT Old", date: "2026-12-31" },
        { tripId: TRIP_ID, title: "IT Visa", date: "2027-05-01" },
        { tripId: TRIP_ID, stopId: "it-rem-porto", title: "IT Port tour", date: "2027-06-02" },
        { tripId: TRIP_ID, stopId: SECRET, title: "IT Secret dinner", date: "2027-06-05" },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the planner sees every Reminder on or after the date, soonest first, with the Stop's name", async () => {
    const rows = await listRemindersForTrip(TRIP_ID, "2027-01-01");
    expect(rows.map((r) => r.title)).toEqual(["IT Visa", "IT Port tour", "IT Secret dinner"]);
    expect(rows[1]).toMatchObject({ stopId: "it-rem-porto", stopName: "IT Porto" });
    expect(rows[0]).toMatchObject({ stopId: null, stopName: null });
  });

  it("the Traveller the Stop surprises does not see the Reminder about it", async () => {
    viewer.id = MEMBER;
    expect((await listRemindersForTrip(TRIP_ID, "2027-01-01")).map((r) => r.title)).toEqual(["IT Visa", "IT Port tour"]);
  });
});
