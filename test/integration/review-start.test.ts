import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { REVIEW_MESSAGES } from "@/lib/review/messages";
import { beginReview } from "@/lib/review/start";

// Real Postgres (spec 2026-10-17 R12): the permission, limit and per-Trip
// checks and the RUNNING insert happen under one lock, so two starts at once
// can never both pass.
const UNLIMITED = "it-rst-unlimited";
const UNLIMITED_2 = "it-rst-unlimited-2";
const LIMITED = "it-rst-limited";
const OFF = "it-rst-off";
const USERS = [UNLIMITED, UNLIMITED_2, LIMITED, OFF];
const TRIP_A = "it-rst-trip-a";
const TRIP_B = "it-rst-trip-b";
const MODEL = "claude-sonnet-5";
const MINUTE = 60_000;

async function spendRow(estimatedCostMicroUsd: number | null, outcome: string): Promise<string> {
  const row = await db.aiUsage.create({ data: { tripId: TRIP_B, userId: LIMITED, model: MODEL, estimatedCostMicroUsd, outcome }, select: { id: true } });
  return row.id;
}

describe.skipIf(process.env.INTEGRATION !== "1")("starting a Review (real Postgres)", () => {
  beforeAll(async () => {
    for (const [id, reviewPermission] of [[UNLIMITED, "UNLIMITED"], [UNLIMITED_2, "UNLIMITED"], [LIMITED, "LIMITED"], [OFF, "OFF"]] as const) {
      await db.user.upsert({ where: { id }, update: { reviewPermission }, create: { id, email: `${id}@example.test`, name: id, reviewPermission } });
    }
  });

  beforeEach(async () => {
    await db.review.deleteMany({ where: { startedById: { in: USERS } } });
    await db.aiUsage.deleteMany({ where: { userId: { in: USERS } } });
    await db.trip.deleteMany({ where: { id: { in: [TRIP_A, TRIP_B] } } }); // cascades their Reviews
    for (const id of [TRIP_A, TRIP_B]) {
      await db.trip.create({
        data: { id, name: `IT ${id}`, homeCurrency: "EUR", createdById: UNLIMITED,
          members: { create: USERS.map((userId, i) => ({ userId, role: i === 0 ? "owner" : "member" })) } },
      });
    }
  });

  afterAll(async () => {
    await db.aiUsage.deleteMany({ where: { userId: { in: USERS } } });
    await db.trip.deleteMany({ where: { id: { in: [TRIP_A, TRIP_B] } } });
  });

  it("two starts at once on one Trip begin one Review; the other is told one is running", async () => {
    for (let round = 0; round < 5; round++) {
      await db.review.deleteMany({ where: { tripId: TRIP_A } });
      const results = await Promise.all([beginReview(UNLIMITED, TRIP_A, "STANDARD", MODEL), beginReview(UNLIMITED_2, TRIP_A, "DEEP", MODEL)]);
      expect(results.map((r) => r.kind).sort()).toEqual(["running", "started"]);
      expect(await db.review.count({ where: { tripId: TRIP_A, status: "RUNNING" } })).toBe(1);
    }
  });

  it("an Unlimited and a Limited start at once on one Trip: still one Review", async () => {
    const results = await Promise.all([beginReview(UNLIMITED, TRIP_A, "STANDARD", MODEL), beginReview(LIMITED, TRIP_A, "DEEP", MODEL)]);
    expect(results.map((r) => r.kind).sort()).toEqual(["running", "started"]);
    expect(await db.review.count({ where: { tripId: TRIP_A, status: "RUNNING" } })).toBe(1);
  });

  it("a Limited account starting on two Trips at once gets one Review and one refusal at the day's limit", async () => {
    const results = await Promise.all([beginReview(LIMITED, TRIP_A, "STANDARD", MODEL), beginReview(LIMITED, TRIP_B, "DEEP", MODEL)]);
    expect(results.map((r) => r.kind).sort()).toEqual(["limit", "started"]);
    const started = await db.review.findFirstOrThrow({ where: { startedById: LIMITED }, select: { startedAt: true } });
    expect(results.find((r) => r.kind === "limit")).toEqual({ kind: "limit", nextAvailableAt: new Date(started.startedAt.getTime() + 24 * 60 * MINUTE) });
  });

  it("a Review that failed before any call does not count against a Limited account", async () => {
    await db.review.create({ data: { tripId: TRIP_B, startedById: LIMITED, kind: "STANDARD", model: MODEL, status: "FAILED", error: REVIEW_MESSAGES.busy, startedAt: new Date(Date.now() - MINUTE), finishedAt: new Date() } });
    // Busy at once: a spend row, but nothing billed.
    const free = await spendRow(0, "api_error");
    await db.review.create({ data: { tripId: TRIP_B, startedById: LIMITED, kind: "STANDARD", model: MODEL, status: "FAILED", error: REVIEW_MESSAGES.busy, startedAt: new Date(Date.now() - MINUTE), finishedAt: new Date(), aiUsageId: free } });
    expect((await beginReview(LIMITED, TRIP_A, "STANDARD", MODEL)).kind).toBe("started");
  });

  it("a failed Review that recorded spend counts (final wave I3): a paid call, or a timeout", async () => {
    for (const [cost, outcome] of [[1_200, "api_error"], [null, "timed_out"]] as const) {
      await db.review.deleteMany({ where: { startedById: LIMITED } });
      const spent = await spendRow(cost, outcome);
      await db.review.create({ data: { tripId: TRIP_B, startedById: LIMITED, kind: "STANDARD", model: MODEL, status: "FAILED", error: REVIEW_MESSAGES.timeout, startedAt: new Date(Date.now() - MINUTE), finishedAt: new Date(), aiUsageId: spent } });
      expect((await beginReview(LIMITED, TRIP_A, "STANDARD", MODEL)).kind).toBe("limit");
    }
  });

  it("a Review left RUNNING for over 15 minutes is marked failed and blocks neither the Trip nor the count", async () => {
    const stale = await db.review.create({ data: { tripId: TRIP_A, startedById: LIMITED, kind: "STANDARD", model: MODEL, status: "RUNNING", startedAt: new Date(Date.now() - 16 * MINUTE) } });
    expect((await beginReview(LIMITED, TRIP_A, "DEEP", MODEL)).kind).toBe("started");
    expect(await db.review.findUniqueOrThrow({ where: { id: stale.id }, select: { status: true, error: true, finishedAt: true } }))
      .toEqual({ status: "FAILED", error: REVIEW_MESSAGES.stale, finishedAt: expect.any(Date) });
  });

  it("the account's own stale run on another Trip is marked failed too", async () => {
    const stale = await db.review.create({ data: { tripId: TRIP_B, startedById: LIMITED, kind: "STANDARD", model: MODEL, status: "RUNNING", startedAt: new Date(Date.now() - 16 * MINUTE) } });
    expect((await beginReview(LIMITED, TRIP_A, "DEEP", MODEL)).kind).toBe("started");
    expect((await db.review.findUniqueOrThrow({ where: { id: stale.id }, select: { status: true } })).status).toBe("FAILED");
  });

  it("an account whose Reviews are Off starts nothing", async () => {
    expect(await beginReview(OFF, TRIP_A, "STANDARD", MODEL)).toEqual({ kind: "off" });
    expect(await db.review.count({ where: { tripId: TRIP_A } })).toBe(0);
  });
});
