import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { readPlan } from "@/lib/plan-reads";

// Real Postgres (npm run test:integration). lib/plan-reads.test.ts mocks the
// db; only a real database proves every select, the plan scope and the
// Surprise fragments are ones Postgres accepts and applies.
const OWNER = "it-plan-owner";
const MEMBER = "it-plan-member";
const TRIP_ID = "it-plan-trip";
const FORK_ID = "it-plan-fork";
const STOP_A = "it-plan-porto";
const STOP_B = "it-plan-secret";
const FORK_STOP = "it-plan-fork-seville";

describe.skipIf(process.env.INTEGRATION !== "1")("readPlan (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: OWNER }, update: {}, create: { id: OWNER, email: "plan-owner@example.test", name: "Plan Owner" } });
    await db.user.upsert({ where: { id: MEMBER }, update: {}, create: { id: MEMBER, email: "plan-member@example.test", name: "Plan Member" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } }); // cascades members, forks, stops
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Plan", homeCurrency: "AUD", createdById: OWNER, forksEnabled: true,
        startDate: "2027-06-01", endDate: "2027-06-07",
        members: { create: [{ userId: OWNER, role: "owner" }, { userId: MEMBER, role: "member" }] },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", createdById: OWNER } });
    await db.stop.createMany({
      data: [
        {
          id: STOP_A, tripId: TRIP_ID, name: "IT Porto", timezone: "Europe/Lisbon",
          arriveDate: "2027-06-01", departDate: "2027-06-04", nights: 3, sortOrder: 0, notes: "Port lodges",
        },
        // A live Surprise (departs in the future) hidden from MEMBER.
        {
          id: STOP_B, tripId: TRIP_ID, name: "IT Secret", timezone: "Europe/Lisbon",
          arriveDate: "2027-06-04", departDate: "2027-06-07", nights: 3, sortOrder: 1, notes: "the secret",
          surprisePlannerId: OWNER, surpriseForIds: JSON.stringify([MEMBER]),
        },
        {
          id: FORK_STOP, tripId: TRIP_ID, forkId: FORK_ID, name: "IT Seville", timezone: "Europe/Madrid",
          arriveDate: "2027-06-01", departDate: "2027-06-07", nights: 6, sortOrder: 0,
        },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the real plan, as the surprised member: the Surprise Stop's notes masked, the Fork's Stop excluded", async () => {
    const rows = await readPlan(TRIP_ID, MEMBER, null);
    expect(rows.plan).toBeNull();
    expect(rows.fork).toBeNull();
    expect(rows.stops.map((s) => s.id)).toEqual([STOP_A, STOP_B]);
    const secret = rows.stops.find((s) => s.id === STOP_B)!;
    expect(secret.notes).toBeNull();
    expect(secret.surprise?.youAreSurprised).toBe(true);
    expect(rows.stops.find((s) => s.id === STOP_A)!.notes).toBe("Port lodges");
    expect(rows.visibility.hiddenStopIds).toEqual([STOP_B]);
  });

  it("the planner sees the Surprise Stop's notes", async () => {
    const rows = await readPlan(TRIP_ID, OWNER, null);
    expect(rows.stops.find((s) => s.id === STOP_B)!.notes).toBe("the secret");
  });

  it("a Fork reads that Fork's Stop only", async () => {
    const rows = await readPlan(TRIP_ID, OWNER, FORK_ID);
    expect(rows.plan).toBe(FORK_ID);
    expect(rows.fork).toEqual({ id: FORK_ID, name: "IT Plan B" });
    expect(rows.stops.map((s) => s.id)).toEqual([FORK_STOP]);
  });
});
