import { beforeEach, describe, expect, it, vi } from "vitest";

const { getReview, listReviews } = vi.hoisted(() => ({ getReview: vi.fn(), listReviews: vi.fn() }));
vi.mock("@/lib/review-reads", () => ({ getReview, listReviews }));

import { loadReviewForMcp, loadReviewsForMcp } from "./reviews";

const cam = { id: "u1", name: "Cam" };
const former = { id: null, name: "a former Traveller" };
const summary = (over: Record<string, unknown> = {}) => ({
  id: "rev-1", tripId: "trip-1", kind: "DEEP", model: "claude-opus-5", status: "DONE",
  summary: "Two closures and a pass gap", error: null,
  startedAt: new Date("2027-05-01T09:00:00Z"), finishedAt: new Date("2027-05-01T09:04:00Z"),
  startedBy: cam, openCount: 2, findingCount: 3,
  ...over,
});
const finding = (over: Record<string, unknown> = {}) => ({
  id: "f1", reviewId: "rev-1", severity: "warning", category: "CLOSURE", state: "OPEN", stateBy: null, stateAt: null,
  targetType: "ITEM", targetId: "item-1", date: "2027-06-02",
  title: "Nishiki Market mostly shut on Wednesdays", detail: "Most stalls close on Wednesdays.",
  suggestedFix: { kind: "item.times", itemId: "item-1", date: "2027-06-03" },
  source: "https://example.org/nishiki", origin: "MODEL", firstFoundAt: new Date("2027-05-01T09:04:00Z"),
  canApply: true, canDismiss: true, canUndo: false,
  ...over,
});
const nf = () => Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

describe("Review reads for Claude (R13), over R's reads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list_reviews: R's list, as depth, who by name, ISO times and the open count", async () => {
    listReviews.mockResolvedValue([summary()]);
    const r = await loadReviewsForMcp("trip-1");
    expect(listReviews).toHaveBeenCalledWith("trip-1");
    expect(r).toEqual({
      reviews: [{
        id: "rev-1", tripId: "trip-1", depth: "deep", status: "DONE", startedBy: "Cam",
        startedAt: "2027-05-01T09:00:00.000Z", finishedAt: "2027-05-01T09:04:00.000Z",
        summary: "Two closures and a pass gap", error: null, openFindings: 2,
      }],
    });
  });

  it("R's effective status and its stale error pass straight through, so Claude stops polling a dead run", async () => {
    listReviews.mockResolvedValue([summary({ kind: "STANDARD", status: "FAILED", error: "This Review stopped before it finished.", finishedAt: null })]);
    const [stale] = (await loadReviewsForMcp("trip-1")).reviews;
    expect(stale).toMatchObject({ depth: "standard", status: "FAILED", error: "This Review stopped before it finished.", finishedAt: null });
  });

  it("a Review whose starter's account is gone reads as started by a former Traveller", async () => {
    listReviews.mockResolvedValue([summary({ startedBy: former })]);
    expect((await loadReviewsForMcp("trip-1")).reviews[0].startedBy).toBe("a former Traveller");
  });

  it("list_reviews for a trip the caller isn't on is not found", async () => {
    listReviews.mockRejectedValue(nf());
    await expect(loadReviewsForMcp("trip-x")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("get_review: R's Review with its Findings, each with its target, parsed fix and the tool to make it", async () => {
    getReview.mockResolvedValue({
      ...summary(),
      findings: [
        finding(),
        finding({
          id: "f2", severity: "info", category: "PACKING", state: "DISMISSED", stateBy: cam,
          stateAt: new Date("2027-05-01T09:10:00Z"), targetType: "TRIP", targetId: null, date: null,
          suggestedFix: null, source: null, origin: "FLAG", canApply: false, canDismiss: false, canUndo: true,
        }),
      ],
    });
    const r = await loadReviewForMcp("rev-1");
    expect(getReview).toHaveBeenCalledWith("rev-1");
    expect(r).toMatchObject({ id: "rev-1", depth: "deep", model: "claude-opus-5", status: "DONE", openFindings: 2 });
    expect(r.findings).toEqual([
      {
        id: "f1", severity: "warning", category: "CLOSURE", state: "OPEN", stateBy: null, stateAt: null,
        target: { type: "ITEM", id: "item-1" }, date: "2027-06-02",
        title: "Nishiki Market mostly shut on Wednesdays", detail: "Most stalls close on Wednesdays.",
        suggestedFix: { kind: "item.times", itemId: "item-1", date: "2027-06-03" },
        fixWith: "update_thing_to_do with startTime and endTime, or schedule_thing_to_do to change the date",
        source: "https://example.org/nishiki", origin: "MODEL",
      },
      {
        id: "f2", severity: "info", category: "PACKING", state: "DISMISSED", stateBy: "Cam", stateAt: "2027-05-01T09:10:00.000Z",
        target: { type: "TRIP", id: null }, date: null, title: "Nishiki Market mostly shut on Wednesdays",
        detail: "Most stalls close on Wednesdays.", suggestedFix: null, fixWith: null, source: null, origin: "FLAG",
      },
    ]);
  });

  it("a fix R withheld (its row is hidden from the caller by a Surprise) names no tool either", async () => {
    getReview.mockResolvedValue({ ...summary(), findings: [finding({ suggestedFix: null, canApply: false })] });
    const [f] = (await loadReviewForMcp("rev-1")).findings;
    expect([f.suggestedFix, f.fixWith]).toEqual([null, null]);
  });

  it("a Finding Dismissed by a since-deleted account names a former Traveller", async () => {
    getReview.mockResolvedValue({ ...summary(), findings: [finding({ state: "DISMISSED", stateBy: former, stateAt: new Date("2027-05-01T09:10:00Z") })] });
    expect((await loadReviewForMcp("rev-1")).findings[0].stateBy).toBe("a former Traveller");
  });

  it("a restated Flag that no longer fires reaches Claude as FIXED, the state R shows (spec 2026-10-18 A4)", async () => {
    getReview.mockResolvedValue({ ...summary({ openCount: 0 }), findings: [finding({ origin: "FLAG", state: "FIXED", liveFlag: null, canApply: false, canDismiss: false })] });
    const r = await loadReviewForMcp("rev-1");
    expect(r.openFindings).toBe(0);
    expect(r.findings[0]).toMatchObject({ state: "FIXED", origin: "FLAG" });
  });

  it("get_review of a missing Review, or one on another trip, is not found", async () => {
    getReview.mockRejectedValue(nf());
    await expect(loadReviewForMcp("theirs")).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404") });
  });
});
