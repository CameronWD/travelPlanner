import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ id: "it-act-owner" }));
vi.mock("@/lib/guards", () => ({
  requireUser: vi.fn(async () => ({ id: viewer.id })),
  requireTripAccess: vi.fn(async () => ({ user: { id: viewer.id }, membership: { role: "owner", lastReadActivityAt: null } })),
}));

import { db } from "@/lib/db";
import { getRecentActivity, getUnreadActivityCount } from "@/lib/activity-reads";
import { listForks } from "@/lib/fork-reads";
import { recordActivity } from "@/lib/activity-record";

// Real Postgres (npm run test:integration): the reads moved out of
// server/actions/{activity,forks}.ts (card 3.N) run against a real database,
// including the viewer's Surprise fragment on the feed.
const OWNER = "it-act-owner";
const OTHER = "it-act-other";
const TRIP_ID = "it-act-trip";
const SECRET = "it-act-secret";

describe.skipIf(process.env.INTEGRATION !== "1")("activity and Fork reads (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: OWNER }, update: {}, create: { id: OWNER, email: "act-owner@example.test", name: "Act Owner" } });
    await db.user.upsert({ where: { id: OTHER }, update: {}, create: { id: OTHER, email: "act-other@example.test", name: "Act Other" } });
  });

  beforeEach(async () => {
    viewer.id = OWNER;
    await db.trip.deleteMany({ where: { id: TRIP_ID } }); // cascades members, forks, stops, activity
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Activity", homeCurrency: "AUD", createdById: OWNER, forksEnabled: true,
        startDate: "2027-06-01", endDate: "2027-06-07",
        members: { create: [{ userId: OWNER, role: "owner" }, { userId: OTHER, role: "member" }] },
      },
    });
    // A live Surprise the owner planned for OTHER.
    await db.stop.create({
      data: {
        id: SECRET, tripId: TRIP_ID, name: "IT Secret", timezone: "Europe/Lisbon", sortOrder: 0,
        arriveDate: "2027-06-04", departDate: "2027-06-07", nights: 3,
        surprisePlannerId: OWNER, surpriseForIds: JSON.stringify([OTHER]),
      },
    });
    await db.activity.createMany({
      data: [
        { tripId: TRIP_ID, actorId: OTHER, verb: "CREATED", entityType: "ITEM", entityLabel: "IT Dinner", createdAt: new Date("2027-01-01T10:00:00Z") },
        { tripId: TRIP_ID, actorId: OWNER, verb: "UPDATED", entityType: "STOP", entityId: SECRET, entityLabel: "IT Secret",
          surpriseOfType: "STOP", surpriseOfId: SECRET, createdAt: new Date("2027-01-01T11:00:00Z") },
        { tripId: TRIP_ID, actorId: OTHER, verb: "CREATED", entityType: "ITEM", entityLabel: "IT Stamped",
          surpriseOfType: "STOP", surpriseOfId: SECRET, createdAt: new Date("2027-01-01T12:00:00Z") },
      ],
    });
    await db.fork.createMany({
      data: [
        { id: "it-act-fork-b", tripId: TRIP_ID, name: "IT Plan C", sortOrder: 1, createdById: OWNER },
        { id: "it-act-fork-a", tripId: TRIP_ID, name: "IT Plan B", sortOrder: 0, createdById: OWNER },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the unread count counts only others' unstamped rows", async () => {
    expect(await getUnreadActivityCount(TRIP_ID)).toBe(1);
  });

  it("the recent feed is newest first with the actor, and hides a Surprise's rows from the Traveller it surprises", async () => {
    const mine = await getRecentActivity(TRIP_ID, 10);
    expect(mine.map((a) => a.entityLabel)).toEqual(["IT Stamped", "IT Secret", "IT Dinner"]);
    expect(mine[2].actor?.name).toBe("Act Other");
    viewer.id = OTHER;
    expect((await getRecentActivity(TRIP_ID, 10)).map((a) => a.entityLabel)).toEqual(["IT Dinner"]);
  });

  it("recordActivity writes an app-sourced row as the signed-in Traveller", async () => {
    await recordActivity({ tripId: TRIP_ID, verb: "CREATED", entityType: "STOP", entityLabel: "IT Lisbon", surpriseOf: null });
    const row = await db.activity.findFirst({ where: { tripId: TRIP_ID, entityLabel: "IT Lisbon" } });
    expect(row).toMatchObject({ actorId: OWNER, source: null, surpriseOfId: null });
  });

  it("listForks lists the Trip's Forks in sortOrder", async () => {
    expect((await listForks(TRIP_ID)).map((f) => f.name)).toEqual(["IT Plan B", "IT Plan C"]);
  });
});
