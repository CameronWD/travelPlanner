import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { markReviewFailed, saveReviewResult } from "@/lib/review-store";
import { REVIEW_STALE_AFTER_MS } from "@/lib/review-permission";
import type { FindingDraft } from "@/lib/review/types";

// Spec 2026-10-17 R10 against the real Postgres: a Review's Findings are
// stored in order, matched to the previous DONE Review's, with history carried.
const USER = "it-rs-user";
const OTHER = "it-rs-other";
const TRIP_ID = "it-rs-trip";
const T0 = new Date("2026-10-19T09:00:00Z");
const DISMISSED_AT = new Date("2026-10-19T09:30:00Z");
const SAVED_AT = new Date("2026-10-20T09:05:00Z");
/** A save a minute after T0: fresh, whatever the wall clock says (the stale cutoff is measured from meta.now). */
const SOON = new Date(T0.getTime() + 60_000);

const draft = (over: Partial<FindingDraft>): FindingDraft => ({
  severity: "warning", category: "CLOSURE", targetType: "ITEM", targetId: "it-rs-museum",
  title: "Closed on Mondays", detail: "The museum is closed on Mondays.", origin: "MODEL", ...over,
});
const running = (id: string, startedAt = T0) =>
  db.review.create({ data: { id, tripId: TRIP_ID, startedById: USER, kind: "STANDARD", model: "claude-sonnet-5", startedAt } });

describe.skipIf(process.env.INTEGRATION !== "1")("saveReviewResult and markReviewFailed (spec 2026-10-17 R10, real Postgres)", () => {
  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    for (const id of [USER, OTHER]) {
      await db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.test`, name: id } });
    }
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Review store", homeCurrency: "AUD", createdById: USER,
        members: { create: [{ userId: USER, role: "owner" }, { userId: OTHER, role: "member" }] },
      },
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the first Review stores every draft Open, in order, and is DONE", async () => {
    await running("it-rs-r1");
    const fix = { kind: "item.note", itemId: "it-rs-museum", append: "Closed Mondays." } as const;
    const res = await saveReviewResult(
      "it-rs-r1",
      [draft({ suggestedFix: fix }), draft({ category: "PACKING", targetType: "TRIP", targetId: undefined, title: "Bring a rain jacket", severity: "info" })],
      { summary: "Two things to look at.", aiUsageId: "it-rs-usage", now: SOON },
    );
    expect(res).toEqual({ saved: true, findingCount: 2 });

    const review = await db.review.findUniqueOrThrow({ where: { id: "it-rs-r1" } });
    expect(review).toMatchObject({ status: "DONE", summary: "Two things to look at.", aiUsageId: "it-rs-usage", error: null });
    expect(review.finishedAt).toBeInstanceOf(Date);

    const findings = await db.finding.findMany({ where: { reviewId: "it-rs-r1" }, orderBy: { position: "asc" } });
    expect(findings.map((f) => [f.key, f.state, f.position, f.previousId, f.tripId])).toEqual([
      ["CLOSURE|ITEM|it-rs-museum", "OPEN", 0, null, TRIP_ID],
      ["PACKING|TRIP|-", "OPEN", 1, null, TRIP_ID],
    ]);
    expect(JSON.parse(findings[0].suggestedFix!)).toEqual(fix);
    expect(findings[1].suggestedFix).toBeNull();
  });

  it("the next Review carries history: Dismissed stays Dismissed, Applied found again is Open, an unmatched Open is No longer found", async () => {
    await db.review.create({ data: { id: "it-rs-r1", tripId: TRIP_ID, startedById: USER, kind: "STANDARD", model: "m", status: "DONE", startedAt: T0, finishedAt: T0 } });
    const base = { reviewId: "it-rs-r1", tripId: TRIP_ID, severity: "warning", targetType: "ITEM", detail: "d", origin: "MODEL", firstFoundAt: T0 };
    await db.finding.createMany({
      data: [
        { ...base, id: "it-rs-dismissed", key: "CLOSURE|ITEM|a", category: "CLOSURE", targetId: "a", title: "Closed", state: "DISMISSED", stateById: OTHER, stateAt: DISMISSED_AT },
        { ...base, id: "it-rs-applied", key: "BOOKING|ITEM|b", category: "BOOKING", targetId: "b", title: "Book it", state: "APPLIED", stateById: USER, stateAt: DISMISSED_AT },
        { ...base, id: "it-rs-open", key: "TICKET|ITEM|c", category: "TICKET", targetId: "c", title: "Ticket", state: "OPEN" },
        { ...base, id: "it-rs-old-dismissed", key: "SEASON|ITEM|d", category: "SEASON", targetId: "d", title: "Season", state: "DISMISSED", stateById: OTHER, stateAt: DISMISSED_AT },
      ],
    });
    await running("it-rs-r2", new Date(T0.getTime() + 86_400_000));

    await saveReviewResult(
      "it-rs-r2",
      [
        draft({ category: "CLOSURE", targetId: "a", title: "Closed (reworded)" }),
        draft({ category: "BOOKING", targetId: "b", title: "Book it" }),
        draft({ category: "HOLIDAY", targetType: "DAY", targetId: undefined, date: "2027-06-10", title: "Public holiday" }),
      ],
      { summary: "Again.", aiUsageId: null, now: SAVED_AT },
    );

    const next = await db.finding.findMany({ where: { reviewId: "it-rs-r2" }, orderBy: { position: "asc" } });
    expect(next.map((f) => ({ key: f.key, state: f.state, stateById: f.stateById, stateAt: f.stateAt, previousId: f.previousId }))).toEqual([
      { key: "CLOSURE|ITEM|a", state: "DISMISSED", stateById: OTHER, stateAt: DISMISSED_AT, previousId: "it-rs-dismissed" },
      { key: "BOOKING|ITEM|b", state: "OPEN", stateById: null, stateAt: null, previousId: "it-rs-applied" },
      { key: "HOLIDAY|DAY|2027-06-10", state: "OPEN", stateById: null, stateAt: null, previousId: null },
    ]);
    expect(next[0].firstFoundAt).toEqual(T0);
    expect(next[2].firstFoundAt).toEqual(SAVED_AT); // first found by this Review: stamped now

    const old = Object.fromEntries((await db.finding.findMany({ where: { reviewId: "it-rs-r1" } })).map((f) => [f.id, f.state]));
    expect(old).toEqual({ "it-rs-dismissed": "DISMISSED", "it-rs-applied": "APPLIED", "it-rs-open": "GONE", "it-rs-old-dismissed": "DISMISSED" });
  });

  it("matches only against DONE Reviews: a FAILED one in between is skipped", async () => {
    await db.review.create({ data: { id: "it-rs-r1", tripId: TRIP_ID, startedById: USER, kind: "STANDARD", model: "m", status: "DONE", startedAt: T0, finishedAt: T0 } });
    await db.finding.create({ data: { id: "it-rs-d", reviewId: "it-rs-r1", tripId: TRIP_ID, key: "CLOSURE|ITEM|a", severity: "warning", category: "CLOSURE", targetType: "ITEM", targetId: "a", title: "Closed", detail: "d", origin: "MODEL", state: "DISMISSED", stateById: OTHER, stateAt: DISMISSED_AT } });
    await db.review.create({ data: { id: "it-rs-failed", tripId: TRIP_ID, startedById: USER, kind: "STANDARD", model: "m", status: "FAILED", startedAt: new Date(T0.getTime() + 1000), finishedAt: new Date(T0.getTime() + 2000) } });
    await running("it-rs-r3", new Date(T0.getTime() + 3000));
    await saveReviewResult("it-rs-r3", [draft({ targetId: "a", title: "Closed" })], { summary: "s", now: new Date(T0.getTime() + 63_000) });
    expect(await db.finding.findFirstOrThrow({ where: { reviewId: "it-rs-r3" } })).toMatchObject({ state: "DISMISSED", previousId: "it-rs-d" });
  });

  it("a Review that is no longer RUNNING saves nothing", async () => {
    await db.review.create({ data: { id: "it-rs-r1", tripId: TRIP_ID, startedById: USER, kind: "STANDARD", model: "m", status: "FAILED", startedAt: T0 } });
    expect(await saveReviewResult("it-rs-r1", [draft({})], { summary: "late" })).toEqual({ saved: false, findingCount: 0 });
    expect(await db.finding.count({ where: { reviewId: "it-rs-r1" } })).toBe(0);
    expect(await db.review.findUniqueOrThrow({ where: { id: "it-rs-r1" } })).toMatchObject({ status: "FAILED", summary: null });
  });

  it("a RUNNING Review past the stale cutoff saves nothing: it already reads as FAILED", async () => {
    await running("it-rs-r1");
    const late = new Date(T0.getTime() + REVIEW_STALE_AFTER_MS);
    expect(await saveReviewResult("it-rs-r1", [draft({})], { summary: "late", now: late })).toEqual({ saved: false, findingCount: 0 });
    expect(await db.finding.count({ where: { reviewId: "it-rs-r1" } })).toBe(0);
    expect(await db.review.findUniqueOrThrow({ where: { id: "it-rs-r1" } })).toMatchObject({ status: "RUNNING", summary: null, finishedAt: null });

    const justInTime = new Date(T0.getTime() + REVIEW_STALE_AFTER_MS - 1);
    expect(await saveReviewResult("it-rs-r1", [draft({})], { summary: "in time", now: justInTime })).toEqual({ saved: true, findingCount: 1 });
  });

  it("an invalid suggested fix is stored as no fix", async () => {
    await running("it-rs-r1");
    await saveReviewResult("it-rs-r1", [draft({ suggestedFix: { kind: "item.note", itemId: "x", append: "" } })], { summary: "s", now: SOON });
    expect((await db.finding.findFirstOrThrow({ where: { reviewId: "it-rs-r1" } })).suggestedFix).toBeNull();
  });

  it("markReviewFailed fails a RUNNING Review once, with its reason", async () => {
    await running("it-rs-r1");
    expect(await markReviewFailed("it-rs-r1", "The model's answer didn't make sense.")).toBe(true);
    expect(await markReviewFailed("it-rs-r1", "again")).toBe(false);
    const review = await db.review.findUniqueOrThrow({ where: { id: "it-rs-r1" } });
    expect(review).toMatchObject({ status: "FAILED", error: "The model's answer didn't make sense." });
    expect(review.finishedAt).toBeInstanceOf(Date);
  });
});
