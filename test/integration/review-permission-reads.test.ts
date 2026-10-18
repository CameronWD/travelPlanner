import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { countedReviewStarts, loadReviewStanding } from "@/lib/review-permission-reads";

// Spec 2026-10-17 R12 + decisions 2 and 3, against the real Postgres: DONE
// and fresh RUNNING runs count, and (final wave I3) a FAILED run that spent
// something; a FAILED run with no spend and a stale RUNNING one (older than
// REVIEW_STALE_AFTER_MS) don't; neither do another account's runs or runs
// before `since`.
// The forUpdate read holds the User row until its transaction ends.
const TRIP_ID = "it-trip-review-permission";
const ME = "it-rpr-me";
const OTHER = "it-rpr-other";
const NOW = new Date();
const H = 3_600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const base = { tripId: TRIP_ID, kind: "STANDARD", model: "claude-sonnet-5" };

describe.skipIf(process.env.INTEGRATION !== "1")("review permission reads (R12, real Postgres)", () => {
  beforeAll(async () => {
    await db.review.deleteMany({ where: { tripId: TRIP_ID } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    for (const id of [ME, OTHER]) {
      await db.user.upsert({ where: { id }, update: { reviewPermission: "LIMITED" }, create: { id, email: `${id}@example.test`, name: id, reviewPermission: "LIMITED" } });
    }
    await db.trip.create({
      data: { id: TRIP_ID, name: "IT Review permission", homeCurrency: "AUD", createdById: ME,
        members: { create: [{ userId: ME, role: "owner" }, { userId: OTHER, role: "member" }] } },
    });
    await db.review.createMany({ data: [
      { ...base, id: "it-rpr-done", startedById: ME, status: "DONE", startedAt: ago(30 * H), finishedAt: ago(30 * H) },
      { ...base, id: "it-rpr-running", startedById: ME, status: "RUNNING", startedAt: ago(2 * 60_000) },
      { ...base, id: "it-rpr-stale", startedById: ME, status: "RUNNING", startedAt: ago(20 * 60_000) },
      { ...base, id: "it-rpr-failed", startedById: ME, status: "FAILED", startedAt: ago(2 * H), error: "boom" },
      { ...base, id: "it-rpr-old", startedById: ME, status: "DONE", startedAt: ago(8 * 24 * H) },
      { ...base, id: "it-rpr-theirs", startedById: OTHER, status: "DONE", startedAt: ago(1 * H) },
    ] });
  });

  afterAll(async () => {
    // Reviews first: whatever onDelete R.1 gives Review.startedById, the users can then go.
    await db.review.deleteMany({ where: { tripId: TRIP_ID } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.deleteMany({ where: { id: { in: [ME, OTHER] } } });
  });

  it("counts a FAILED run only when its spend row cost something or timed out (final wave I3)", async () => {
    const SPENDER = "it-rpr-spender";
    await db.user.upsert({ where: { id: SPENDER }, update: {}, create: { id: SPENDER, email: `${SPENDER}@example.test`, name: SPENDER, reviewPermission: "LIMITED" } });
    const usage = async (estimatedCostMicroUsd: number | null, outcome: string) =>
      (await db.aiUsage.create({ data: { tripId: TRIP_ID, userId: SPENDER, model: base.model, estimatedCostMicroUsd, outcome }, select: { id: true } })).id;
    try {
      await db.review.createMany({ data: [
        { ...base, id: "it-rpr-s-paid", startedById: SPENDER, status: "FAILED", startedAt: ago(4 * H), error: "x", aiUsageId: await usage(2_500, "unreadable") },
        { ...base, id: "it-rpr-s-timeout", startedById: SPENDER, status: "FAILED", startedAt: ago(3 * H), error: "x", aiUsageId: await usage(null, "timed_out") },
        { ...base, id: "it-rpr-s-free", startedById: SPENDER, status: "FAILED", startedAt: ago(2 * H), error: "x", aiUsageId: await usage(0, "api_error") },
        { ...base, id: "it-rpr-s-none", startedById: SPENDER, status: "FAILED", startedAt: ago(1 * H), error: "x" },
      ] });
      expect(await countedReviewStarts(SPENDER, ago(7 * 24 * H), { now: NOW })).toEqual([ago(4 * H), ago(3 * H)]);
    } finally {
      await db.review.deleteMany({ where: { startedById: SPENDER } });
      await db.aiUsage.deleteMany({ where: { userId: SPENDER } });
      await db.user.deleteMany({ where: { id: SPENDER } });
    }
  });

  it("counts DONE and fresh RUNNING, oldest first, and not a FAILED run with no spend", async () => {
    expect(await countedReviewStarts(ME, ago(7 * 24 * H), { now: NOW })).toEqual([ago(30 * H), ago(2 * 60_000)]);
  });

  it("standing: Limited, both caps full; the week frees later (7 days after the 30h-old run)", async () => {
    // Day window: the fresh run frees it at +24h. Week window: two counted runs
    // (30h ago, 2 min ago) free it when the 30h-old one leaves, at +6d18h. Later wins.
    expect(await loadReviewStanding(ME, { now: NOW })).toEqual({
      permission: "LIMITED",
      canRun: false,
      nextAvailableAt: new Date(ago(30 * H).getTime() + 7 * 24 * H),
    });
  });

  it("forUpdate makes a second locker wait for the first transaction", async () => {
    const order: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const first = db.$transaction(async (tx) => {
      await loadReviewStanding(ME, { now: NOW, client: tx, forUpdate: true });
      order.push("first locked");
      await held;
      order.push("first done");
    });
    // Let the first take the lock before the second asks for it.
    await new Promise((r) => setTimeout(r, 200));
    const second = db.$transaction(async (tx) => {
      await loadReviewStanding(ME, { now: NOW, client: tx, forUpdate: true });
      order.push("second locked");
    });
    await new Promise((r) => setTimeout(r, 200));
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["first locked", "first done", "second locked"]);
  });
});
