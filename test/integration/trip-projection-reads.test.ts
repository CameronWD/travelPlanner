import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-proj-user" }, membership: { role: "owner" } })),
}));

import { db } from "@/lib/db";
import { getTripProjection } from "@/lib/trip-projection-reads";

// Real Postgres (npm run test:integration): the projection read moved out of
// server/actions/stops.ts (card 3.N) — the plan-scoped selects are ones
// Postgres accepts, and a Fork resolves its own rows.
const USER = "it-proj-user";
const TRIP_ID = "it-proj-trip";
const FORK_ID = "it-proj-fork";

describe.skipIf(process.env.INTEGRATION !== "1")("getTripProjection (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "proj@example.test", name: "Proj IT" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Projection", homeCurrency: "AUD", createdById: USER, forksEnabled: true,
        startDate: "2027-07-01", hardEndDate: "2027-07-20",
        members: { create: { userId: USER, role: "owner" } },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", createdById: USER } });
    await db.stop.createMany({
      data: [
        { id: "it-proj-a", tripId: TRIP_ID, name: "IT Porto", nights: 3, sortOrder: 0 },
        { id: "it-proj-b", tripId: TRIP_ID, name: "IT Rome", nights: 4, sortOrder: 1, timezone: "Europe/Rome" },
        { id: "it-proj-f", tripId: TRIP_ID, forkId: FORK_ID, name: "IT Seville", nights: 10, sortOrder: 0 },
      ],
    });
    await db.transport.create({
      data: { tripId: TRIP_ID, mode: "FLIGHT", fromStopId: "it-proj-b", arrIsHome: true, depAt: new Date("2027-07-08T09:00:00Z") },
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("projects the real plan and resolves its dated return leg as the deadline (ADR 0068)", async () => {
    const r = await getTripProjection(TRIP_ID);
    expect(r.projectedEnd).toBe("2027-07-08");
    expect(r.hardEndDate).toBe("2027-07-20");
    expect(r.deadline).toEqual({ kind: "return-leg", date: "2027-07-08", mode: "FLIGHT", homeward: true });
  });

  it("a Fork projects its own Stops and falls back to the hard end date", async () => {
    const r = await getTripProjection(TRIP_ID, FORK_ID);
    expect(r.projectedEnd).toBe("2027-07-11");
    expect(r.deadline).toEqual({ kind: "hard-end", date: "2027-07-20" });
  });
});
