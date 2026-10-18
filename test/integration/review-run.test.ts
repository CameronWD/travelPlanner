import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { callReviewModel } = vi.hoisted(() => ({ callReviewModel: vi.fn() }));
// The one fake: Claude. Everything else (the plan read, the Flags, the
// matching, AiUsage) runs for real against Postgres.
vi.mock("@/lib/review/call", () => ({ callReviewModel, REVIEW_RUN_BUDGET_MS: 270_000 }));

import { db } from "@/lib/db";
import { addDays } from "@/lib/dates";
import type { ReviewInput } from "@/lib/review/input-shape";
import { findingKey } from "@/lib/review/key";
import { REVIEW_MESSAGES } from "@/lib/review/messages";
import { REVIEW_STALE_AFTER_MS } from "@/lib/review-permission";
import { runReview } from "@/lib/review/run";
import { todayISOInZone } from "@/lib/tz";
import { serializeOpeningHours } from "@/lib/validations/opening-hours";

// Spec 2026-10-17 R8–R11 on real Postgres: a run reads the plan as a Share
// link would (no Surprise inside it), restates the current Flags, keeps a
// dismissed Finding dismissed and marks an unmatched one No longer found,
// stores Claude's Findings only on rows it may name, and writes one AiUsage
// row it links to.
const OWNER = "it-rr-owner";
const MEMBER = "it-rr-member";
const TRIP_ID = "it-rr-trip";
const PREV = "it-rr-prev";
const NEXT = "it-rr-next";
const TZ = "Europe/Lisbon";
const today = todayISOInZone(TZ);
const D = (n: number) => addDays(today, n);
const forMember = JSON.stringify([MEMBER]);
const DISMISSED_AT = new Date("2026-10-01T10:00:00Z");
const USAGE = { inputTokens: 12_000, outputTokens: 2_000, cacheReadTokens: 0, cacheWriteTokens: 0, webSearchRequests: 3 };
const holidayKey = () => findingKey({ category: "HOLIDAY", targetType: "DAY", date: D(5) });
const packingKey = () => findingKey({ category: "PACKING", targetType: "TRIP" });
const modelFinding = (over: Record<string, unknown>) => ({
  severity: "info", targetId: null, date: null, detail: "IT detail.", source: null, suggestedFix: null, ...over,
});

describe.skipIf(process.env.INTEGRATION !== "1")("a Review run (real Postgres)", () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;

  beforeAll(async () => {
    // isAiConfigured() only checks that a key is set; the call itself is faked above.
    process.env.ANTHROPIC_API_KEY = "sk-it-fake";
    for (const id of [OWNER, MEMBER]) await db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.test`, name: id } });
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    await db.aiUsage.deleteMany({ where: { tripId: TRIP_ID } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "IT Review run", homeCurrency: "EUR", createdById: OWNER, startDate: D(3), endDate: D(8), roundTrip: false,
        members: { create: [{ userId: OWNER, role: "owner" }, { userId: MEMBER, role: "member" }] } },
    });
    await db.stop.createMany({ data: [
      { id: "it-rr-porto", tripId: TRIP_ID, name: "IT Porto", timezone: TZ, arriveDate: D(3), departDate: D(6), nights: 3, sortOrder: 0 },
      { id: "it-rr-secret", tripId: TRIP_ID, name: "IT Secret", timezone: TZ, arriveDate: D(6), departDate: D(8), nights: 2, sortOrder: 1, surprisePlannerId: OWNER, surpriseForIds: forMember },
    ] });
    await db.accommodation.createMany({ data: [
      { id: "it-rr-casa", tripId: TRIP_ID, stopId: "it-rr-porto", name: "IT Casa", checkIn: D(3), checkOut: D(6), confirmation: "IT-CONF-991", bookingState: "BOOKED", bookingStateSet: true },
      { id: "it-rr-hidden-stay", tripId: TRIP_ID, stopId: "it-rr-secret", name: "IT Secret hotel", checkIn: D(6), checkOut: D(8), bookingState: "BOOKED", bookingStateSet: true },
    ] });
    await db.item.createMany({ data: [
      { id: "it-rr-museum", tripId: TRIP_ID, stopId: "it-rr-porto", title: "IT Museum", category: "SIGHTSEEING", date: D(4), sortOrder: 0,
        openingHours: serializeOpeningHours({ week: {}, seasons: [], closed: [D(4)] }) },
      { id: "it-rr-gift", tripId: TRIP_ID, stopId: "it-rr-porto", title: "IT Secret dinner", notes: "IT Ring in the cake", category: "FOOD", date: D(5), startTime: "19:00", sortOrder: 1,
        surprisePlannerId: OWNER, surpriseForIds: forMember },
    ] });
    await db.review.create({ data: { id: PREV, tripId: TRIP_ID, startedById: OWNER, kind: "STANDARD", model: "claude-sonnet-5", status: "DONE", summary: "IT earlier",
      startedAt: new Date(Date.now() - 2 * 86_400_000), finishedAt: new Date(Date.now() - 2 * 86_400_000 + 60_000) } });
    await db.finding.createMany({ data: [
      { id: "it-rr-f-dismissed", reviewId: PREV, tripId: TRIP_ID, key: holidayKey(), severity: "info", category: "HOLIDAY", targetType: "DAY", targetId: null, date: D(5),
        title: "IT holiday", detail: "IT holiday.", origin: "MODEL", state: "DISMISSED", stateById: MEMBER, stateAt: DISMISSED_AT },
      { id: "it-rr-f-open", reviewId: PREV, tripId: TRIP_ID, key: packingKey(), severity: "info", category: "PACKING", targetType: "TRIP", targetId: null, date: null,
        title: "IT umbrella", detail: "IT umbrella.", origin: "MODEL", state: "OPEN" },
    ] });
    await db.review.create({ data: { id: NEXT, tripId: TRIP_ID, startedById: OWNER, kind: "STANDARD", model: "claude-sonnet-5", status: "RUNNING", startedAt: new Date() } });
  });

  afterAll(async () => {
    await db.aiUsage.deleteMany({ where: { tripId: TRIP_ID } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it("reads the plan as everyone sees it, then stores matched, sanitised Findings, the summary and its AiUsage row", async () => {
    callReviewModel.mockResolvedValue({
      kind: "ok", usage: USAGE,
      output: { summary: "IT three things.", findings: [
        modelFinding({ category: "HOLIDAY", targetType: "DAY", date: D(5), title: "IT public holiday" }),
        modelFinding({ severity: "warning", category: "CLOSURE", targetType: "ITEM", targetId: "it-rr-gift", title: "IT guessed at the Surprise" }),
        modelFinding({ category: "BOOKING", targetType: "ACCOMMODATION", targetId: "it-rr-casa", title: "IT check the stay",
          suggestedFix: { kind: "accommodation.bookingState", id: "it-rr-unknown", bookingState: "TO_BOOK", bookBy: null } }),
      ] },
    });

    await runReview(NEXT);

    const input = callReviewModel.mock.calls[0][0].input as ReviewInput;
    expect(input.plan).toContain("IT Porto");
    expect(input.plan).not.toMatch(/IT Secret dinner|IT Ring in the cake|IT Secret hotel|IT-CONF-991/);
    expect(input.plan).toContain('"surprise":true');
    expect(input.targets.ITEM.has("it-rr-museum")).toBe(true);
    expect(input.targets.ITEM.has("it-rr-gift")).toBe(false);
    expect(input.flags.map((f) => f.id)).toContain("item-closed-it-rr-museum");

    const review = await db.review.findUniqueOrThrow({ where: { id: NEXT }, select: { status: true, summary: true, aiUsageId: true, finishedAt: true, error: true } });
    expect(review).toMatchObject({ status: "DONE", summary: "IT three things.", error: null, finishedAt: expect.any(Date) });
    const usage = await db.aiUsage.findUniqueOrThrow({ where: { id: review.aiUsageId! } });
    expect(usage).toMatchObject({ tripId: TRIP_ID, userId: OWNER, model: "claude-sonnet-5", outcome: "ok", proposalCount: 3, inputTokens: 12_000, outputTokens: 2_000,
      estimatedCostMicroUsd: 74_000 }); // 12,000×2 + 2,000×10 + 3 searches × 10,000

    const findings = await db.finding.findMany({ where: { reviewId: NEXT }, select: { origin: true, category: true, targetType: true, targetId: true, state: true, stateById: true, stateAt: true, suggestedFix: true, title: true } });
    expect(findings.find((f) => f.origin === "FLAG" && f.targetId === "it-rr-museum")).toBeDefined();
    expect(findings.find((f) => f.category === "HOLIDAY")).toMatchObject({ state: "DISMISSED", stateById: MEMBER, stateAt: DISMISSED_AT });
    expect(findings.find((f) => f.title === "IT guessed at the Surprise")).toMatchObject({ targetType: "TRIP", targetId: null, state: "OPEN" });
    expect(findings.find((f) => f.category === "BOOKING")).toMatchObject({ targetType: "ACCOMMODATION", targetId: "it-rr-casa", suggestedFix: null });

    expect(await db.finding.findUniqueOrThrow({ where: { id: "it-rr-f-open" }, select: { state: true } })).toEqual({ state: "GONE" });
    expect(await db.finding.findUniqueOrThrow({ where: { id: "it-rr-f-dismissed" }, select: { state: true } })).toEqual({ state: "DISMISSED" });
  });

  it("a busy Claude fails the run with its reason and its spend row, and leaves the previous Review's Findings alone", async () => {
    callReviewModel.mockResolvedValue({ kind: "busy", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } });
    await runReview(NEXT);
    const review = await db.review.findUniqueOrThrow({ where: { id: NEXT }, select: { status: true, error: true, aiUsageId: true } });
    expect(review).toMatchObject({ status: "FAILED", error: REVIEW_MESSAGES.busy });
    expect(await db.aiUsage.findUniqueOrThrow({ where: { id: review.aiUsageId! }, select: { outcome: true, proposalCount: true } })).toEqual({ outcome: "api_error", proposalCount: 0 });
    expect(await db.finding.count({ where: { reviewId: NEXT } })).toBe(0);
    expect(await db.finding.findUniqueOrThrow({ where: { id: "it-rr-f-open" }, select: { state: true } })).toEqual({ state: "OPEN" });
  });

  it("a run whose row was already marked stale does nothing", async () => {
    await db.review.update({ where: { id: NEXT }, data: { status: "FAILED", error: REVIEW_MESSAGES.stale, finishedAt: new Date() } });
    await runReview(NEXT);
    expect(callReviewModel).not.toHaveBeenCalled();
    expect(await db.aiUsage.count({ where: { tripId: TRIP_ID } })).toBe(0);
  });

  it("a run that finishes after going stale is not saved, but its spend row is linked to the failed Review", async () => {
    await db.review.update({ where: { id: NEXT }, data: { startedAt: new Date(Date.now() - REVIEW_STALE_AFTER_MS - 60_000) } });
    callReviewModel.mockResolvedValue({ kind: "ok", usage: USAGE, output: { summary: "IT late.", findings: [] } });
    await runReview(NEXT);
    const review = await db.review.findUniqueOrThrow({ where: { id: NEXT }, select: { status: true, error: true, aiUsageId: true } });
    expect(review).toMatchObject({ status: "FAILED", error: REVIEW_MESSAGES.stale, aiUsageId: expect.any(String) });
    expect(await db.finding.count({ where: { reviewId: NEXT } })).toBe(0);
    expect(await db.finding.findUniqueOrThrow({ where: { id: "it-rr-f-open" }, select: { state: true } })).toEqual({ state: "OPEN" });
  });
});
