import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

// CONTEXT.md "Review", "Finding" (spec 2026-10-17 R8, R10) against the real
// Postgres: the two tables exist with their defaults, a Finding hangs off its
// Review and its Trip, and deleting the Trip takes both with it.
const TRIP_ID = "it-trip-reviews-migration";
const USER = "it-rv-mig-user";
const STARTER = "it-rv-mig-starter";

describe.skipIf(process.env.INTEGRATION !== "1")("Review and Finding migration (spec 2026-10-17 R8, R10, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.deleteMany({ where: { id: STARTER } });
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "it-rv-mig@example.test", name: "IT RV" } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "IT Reviews migration", homeCurrency: "AUD", createdById: USER, members: { create: { userId: USER, role: "owner" } } },
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.deleteMany({ where: { id: STARTER } });
  });

  it("a new Review is RUNNING from now, and a new Finding is OPEN, first found now", async () => {
    const review = await db.review.create({ data: { tripId: TRIP_ID, startedById: USER, kind: "STANDARD", model: "claude-sonnet-5" } });
    expect(review).toMatchObject({ status: "RUNNING", summary: null, error: null, finishedAt: null, aiUsageId: null });
    expect(review.startedAt).toBeInstanceOf(Date);

    const finding = await db.finding.create({
      data: {
        reviewId: review.id, tripId: TRIP_ID, key: "PACKING|TRIP|-", severity: "info", category: "PACKING",
        targetType: "TRIP", title: "Pack a rain jacket", detail: "Showers most afternoons in June.", origin: "MODEL",
      },
    });
    expect(finding).toMatchObject({
      state: "OPEN", position: 0, targetId: null, date: null, suggestedFix: null, source: null,
      stateById: null, stateAt: null, undoPayload: null, previousId: null,
    });
    expect(finding.firstFoundAt).toBeInstanceOf(Date);
  });

  it("the Finding columns that hold JSON are plain text", async () => {
    const cols = await db.$queryRaw<{ column_name: string; data_type: string }[]>`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'Finding' AND column_name IN ('suggestedFix', 'undoPayload') ORDER BY column_name`;
    expect(cols).toEqual([
      { column_name: "suggestedFix", data_type: "text" },
      { column_name: "undoPayload", data_type: "text" },
    ]);
  });

  it("deleting the starting account keeps the Review and its Findings, starter unknown", async () => {
    await db.user.create({ data: { id: STARTER, email: "it-rv-mig-starter@example.test", name: "IT RV Starter" } });
    const review = await db.review.create({ data: { tripId: TRIP_ID, startedById: STARTER, kind: "DEEP", model: "claude-opus-5", status: "DONE" } });
    const finding = await db.finding.create({
      data: {
        reviewId: review.id, tripId: TRIP_ID, key: "HOLIDAY|DAY|2027-06-10", severity: "info", category: "HOLIDAY", targetType: "DAY",
        date: "2027-06-10", title: "Public holiday", detail: "Portugal Day.", origin: "MODEL", state: "DISMISSED", stateById: USER, stateAt: new Date(),
      },
    });

    await db.user.delete({ where: { id: STARTER } });

    expect(await db.review.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({ startedById: null, status: "DONE" });
    expect(await db.finding.findUniqueOrThrow({ where: { id: finding.id } })).toMatchObject({ state: "DISMISSED", stateById: USER });
  });

  it("deleting the Trip deletes its Reviews and Findings", async () => {
    await db.trip.delete({ where: { id: TRIP_ID } });
    expect(await db.review.count({ where: { tripId: TRIP_ID } })).toBe(0);
    expect(await db.finding.count({ where: { tripId: TRIP_ID } })).toBe(0);
  });
});
