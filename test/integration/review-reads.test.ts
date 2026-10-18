import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Spec 2026-10-17 R9, R10 against the real Postgres: everyone on the Trip
// reads every Review; a Finding about something now hidden from the viewer
// by a Surprise is dropped from every read and count; a stale run reads FAILED.
const NOT_FOUND = () => Object.assign(new Error("NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
vi.mock("next/navigation", () => ({ notFound: () => { throw NOT_FOUND(); } }));
const viewer = vi.hoisted(() => ({ id: "it-rr-member" }));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(async () => ({ user: { id: viewer.id }, membership: { role: "member" } })),
}));

import { db } from "@/lib/db";
import { getReview, latestReview, listReviews, requireFindingAccess, runningReview } from "@/lib/review-reads";
import { FORMER_TRAVELLER_NAME, REVIEW_STALE_ERROR } from "@/lib/review/types";

const PLANNER = "it-rr-planner";
const MEMBER = "it-rr-member";
const TRIP_ID = "it-rr-trip";
const PORTO = "it-rr-porto";
const VISIBLE = "it-rr-lello";
const SECRET = "it-rr-gift"; // a Surprise for MEMBER, planned by PLANNER
const NOW = Date.now();
const ago = (min: number) => new Date(NOW - min * 60_000);
const FIX = JSON.stringify({ kind: "item.note", itemId: VISIBLE, append: "Book online." });
const base = { tripId: TRIP_ID, detail: "d", origin: "MODEL", severity: "warning", category: "CLOSURE" };

describe.skipIf(process.env.INTEGRATION !== "1")("review reads (spec 2026-10-17 R9, R10, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    for (const id of [PLANNER, MEMBER]) await db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.test`, name: id, displayName: id === PLANNER ? "Cam" : "Xanni" } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "IT Review reads", homeCurrency: "AUD", createdById: PLANNER, startDate: "2027-06-01", endDate: "2027-06-07",
        members: { create: [{ userId: PLANNER, role: "owner" }, { userId: MEMBER, role: "member" }] } },
    });
    await db.stop.create({ data: { id: PORTO, tripId: TRIP_ID, name: "IT Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-07", nights: 6, sortOrder: 0 } });
    await db.item.createMany({
      data: [
        { id: VISIBLE, tripId: TRIP_ID, stopId: PORTO, title: "IT Lello", category: "SIGHTSEEING", date: "2027-06-02", sortOrder: 0 },
        { id: SECRET, tripId: TRIP_ID, stopId: PORTO, title: "IT Gift", category: "FOOD", date: "2027-06-03", sortOrder: 1, surprisePlannerId: PLANNER, surpriseForIds: JSON.stringify([MEMBER]) },
      ],
    });
    await db.review.createMany({
      data: [
        { id: "it-rr-r1", tripId: TRIP_ID, startedById: PLANNER, kind: "STANDARD", model: "m", status: "DONE", summary: "First.", startedAt: ago(3000), finishedAt: ago(2990) },
        { id: "it-rr-r2", tripId: TRIP_ID, startedById: MEMBER, kind: "DEEP", model: "m", status: "DONE", summary: "Second.", startedAt: ago(2000), finishedAt: ago(1990) },
        { id: "it-rr-stale", tripId: TRIP_ID, startedById: PLANNER, kind: "STANDARD", model: "m", status: "RUNNING", startedAt: ago(20) },
      ],
    });
    await db.finding.createMany({
      data: [
        { ...base, id: "it-rr-f1", reviewId: "it-rr-r1", key: `CLOSURE|ITEM|${VISIBLE}`, targetType: "ITEM", targetId: VISIBLE, title: "Lello", suggestedFix: FIX, position: 0 },
        { ...base, id: "it-rr-f2", reviewId: "it-rr-r1", key: `CLOSURE|ITEM|${SECRET}`, targetType: "ITEM", targetId: SECRET, title: "Gift shop closed", position: 1 },
        { ...base, id: "it-rr-f3", reviewId: "it-rr-r1", key: "PACKING|TRIP|-", category: "PACKING", targetType: "TRIP", title: "Rain jacket", state: "DISMISSED", stateById: PLANNER, stateAt: ago(2500), position: 2 },
        { ...base, id: "it-rr-f4", reviewId: "it-rr-r2", key: "HOLIDAY|DAY|2027-06-10", category: "HOLIDAY", severity: "info", targetType: "DAY", date: "2027-06-10", title: "Holiday", position: 0 },
        { ...base, id: "it-rr-f5", reviewId: "it-rr-r2", key: `CLOSURE|ITEM|${VISIBLE}`, targetType: "ITEM", targetId: VISIBLE, title: "Lello", suggestedFix: FIX, position: 1 },
        { ...base, id: "it-rr-f6", reviewId: "it-rr-r2", key: `CLOSURE|ITEM|${SECRET}`, targetType: "ITEM", targetId: SECRET, title: "Gift shop closed", position: 2 },
      ],
    });
  });

  beforeEach(() => {
    viewer.id = MEMBER;
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("latestReview is the newest DONE Review: warnings first, and only it can Apply and Dismiss", async () => {
    const r = (await latestReview(TRIP_ID))!;
    expect(r).toMatchObject({ id: "it-rr-r2", kind: "DEEP", status: "DONE", summary: "Second.", startedBy: { id: MEMBER, name: "Xanni" }, openCount: 2, findingCount: 2 });
    expect(r.findings.map((f) => [f.id, f.severity, f.canApply, f.canDismiss])).toEqual([
      ["it-rr-f5", "warning", true, true],
      ["it-rr-f4", "info", false, true],
    ]);
    expect(r.findings[0].suggestedFix).toEqual({ kind: "item.note", itemId: VISIBLE, append: "Book online." });
  });

  it("an older Review reads in full but offers no Apply, Dismiss or Undo of a Dismiss; a Dismissed one names who", async () => {
    const r = await getReview("it-rr-r1");
    expect(r.findings.map((f) => f.id)).toEqual(["it-rr-f1", "it-rr-f3"]); // f2 is about the hidden Gift
    expect(r.findings.every((f) => !f.canApply && !f.canDismiss)).toBe(true);
    expect(r.findings[1]).toMatchObject({ state: "DISMISSED", stateBy: { id: PLANNER, name: "Cam" }, canUndo: false });
    expect(r).toMatchObject({ openCount: 1, findingCount: 2 });
  });

  it("the planner sees the Finding about the Surprise", async () => {
    viewer.id = PLANNER;
    const r = await getReview("it-rr-r1");
    expect(r.findings.map((f) => f.id)).toEqual(["it-rr-f1", "it-rr-f2", "it-rr-f3"]);
    expect(r.openCount).toBe(2);
  });

  it("listReviews is newest first, counts what the viewer can see, and a stale run reads FAILED", async () => {
    const list = await listReviews(TRIP_ID);
    expect(list.map((r) => [r.id, r.status, r.openCount, r.findingCount])).toEqual([
      ["it-rr-stale", "FAILED", 0, 0],
      ["it-rr-r2", "DONE", 2, 2],
      ["it-rr-r1", "DONE", 1, 2],
    ]);
    expect(list[0].error).toBe(REVIEW_STALE_ERROR);
  });

  it("runningReview ignores a stale run and finds a live one", async () => {
    expect(await runningReview(TRIP_ID)).toBeNull();
    await db.review.create({ data: { id: "it-rr-live", tripId: TRIP_ID, startedById: PLANNER, kind: "STANDARD", model: "m", startedAt: ago(1) } });
    expect(await runningReview(TRIP_ID)).toMatchObject({ id: "it-rr-live", status: "RUNNING", startedBy: { name: "Cam" } });
    await db.review.delete({ where: { id: "it-rr-live" } });
  });

  it("a Review whose starter's account is gone reads as started by a former Traveller", async () => {
    await db.review.create({ data: { id: "it-rr-orphan", tripId: TRIP_ID, startedById: null, kind: "STANDARD", model: "m", status: "FAILED", error: "boom", startedAt: ago(5000), finishedAt: ago(4990) } });
    await db.finding.create({ data: { ...base, id: "it-rr-f7", reviewId: "it-rr-orphan", key: "PACKING|TRIP|-", category: "PACKING", targetType: "TRIP", title: "Umbrella", state: "DISMISSED", stateById: null, stateAt: ago(4980), position: 0 } });
    try {
      const r = await getReview("it-rr-orphan");
      expect(r.startedBy).toEqual({ id: null, name: FORMER_TRAVELLER_NAME });
      expect(r.findings[0]).toMatchObject({ state: "DISMISSED", stateBy: { id: null, name: FORMER_TRAVELLER_NAME } });
      expect((await listReviews(TRIP_ID)).at(-1)).toMatchObject({ id: "it-rr-orphan", startedBy: { id: null, name: FORMER_TRAVELLER_NAME } });
    } finally {
      await db.review.delete({ where: { id: "it-rr-orphan" } });
    }
  });

  it("a fix aimed at a row hidden from the viewer, or at any row but its own target, is withheld; Undo follows the latest-Review rule", async () => {
    const SECRET_FIX = JSON.stringify({ kind: "item.note", itemId: SECRET, append: "Wrap it in blue." });
    await db.finding.createMany({
      data: [
        { ...base, id: "it-rr-f8", reviewId: "it-rr-r2", key: "LOGISTICS|TRIP|-", category: "LOGISTICS", targetType: "TRIP", title: "Wrapping", suggestedFix: SECRET_FIX, position: 3 },
        { ...base, id: "it-rr-f9", reviewId: "it-rr-r2", key: "PACKING|TRIP|-", category: "PACKING", targetType: "TRIP", title: "Plug", state: "DISMISSED", stateById: PLANNER, stateAt: ago(10), position: 4 },
        { ...base, id: "it-rr-f10", reviewId: "it-rr-r1", key: "SEASON|TRIP|-", category: "SEASON", targetType: "TRIP", title: "Stranded", suggestedFix: FIX, state: "APPLIED", stateById: PLANNER, stateAt: ago(30), position: 5 },
        { ...base, id: "it-rr-f11", reviewId: "it-rr-r2", key: `TICKET|ITEM|${VISIBLE}`, category: "TICKET", targetType: "ITEM", targetId: VISIBLE, title: "Mismatched", suggestedFix: SECRET_FIX, position: 6 },
      ],
    });
    try {
      const mine = (await latestReview(TRIP_ID))!.findings;
      expect(mine.find((f) => f.id === "it-rr-f8")).toMatchObject({ suggestedFix: null, canApply: false, canDismiss: true });
      expect(JSON.stringify(mine)).not.toContain(SECRET);
      expect(mine.find((f) => f.id === "it-rr-f9")).toMatchObject({ canUndo: true }); // a Dismiss on the latest Review
      // An Apply that never saved its payload, claimed 30 minutes ago: Undo releases it, on any Review.
      expect((await getReview("it-rr-r1")).findings.find((f) => f.id === "it-rr-f10")).toMatchObject({ canUndo: true, canApply: false });

      viewer.id = PLANNER;
      const planner = (await latestReview(TRIP_ID))!.findings;
      // Final wave I1: a fix only touches its Finding's own row, so a stored TRIP Finding's fix reads as none, even for the planner.
      expect(planner.find((f) => f.id === "it-rr-f8")).toMatchObject({ suggestedFix: null, canApply: false, canDismiss: true });
      // And an ITEM Finding's fix aimed at another Item reads as none; one on its own Item is kept (it-rr-f5).
      expect(planner.find((f) => f.id === "it-rr-f11")).toMatchObject({ suggestedFix: null, canApply: false });
      expect(planner.find((f) => f.id === "it-rr-f5")).toMatchObject({ suggestedFix: { kind: "item.note", itemId: VISIBLE }, canApply: true });
    } finally {
      await db.finding.deleteMany({ where: { id: { in: ["it-rr-f8", "it-rr-f9", "it-rr-f10", "it-rr-f11"] } } });
    }
  });

  it("getReview of a Review that doesn't exist is not found", async () => {
    await expect(getReview("it-rr-nope")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("requireFindingAccess hides a Finding about a hidden target and says whether it is on the latest Review", async () => {
    await expect(requireFindingAccess("it-rr-f6")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(await requireFindingAccess("it-rr-f5")).toMatchObject({ user: { id: MEMBER }, isLatest: true, finding: { id: "it-rr-f5", tripId: TRIP_ID, state: "OPEN", suggestedFix: FIX } });
    viewer.id = PLANNER;
    expect(await requireFindingAccess("it-rr-f2")).toMatchObject({ isLatest: false });
  });
});
