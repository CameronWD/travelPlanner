import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Flag } from "@/lib/flags";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(), isAiConfigured: vi.fn(), buildReviewInput: vi.fn(), callReviewModel: vi.fn(),
  recordAiUsage: vi.fn(), saveReviewResult: vi.fn(), failReview: vi.fn(), reportError: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { review: { findUnique: m.findUnique } } }));
vi.mock("@/lib/ai", () => ({ isAiConfigured: m.isAiConfigured }));
vi.mock("@/lib/ai-usage", () => ({ recordAiUsage: m.recordAiUsage }));
vi.mock("@/lib/error-sink", () => ({ reportError: m.reportError }));
vi.mock("@/lib/review-store", () => ({ saveReviewResult: m.saveReviewResult }));
vi.mock("./input", () => ({ buildReviewInput: m.buildReviewInput }));
vi.mock("./call", () => ({ callReviewModel: m.callReviewModel, REVIEW_RUN_BUDGET_MS: 270_000 }));
vi.mock("./fail", () => ({ failReview: m.failReview }));

import type { ReviewInput } from "./input-shape";
import { REVIEW_MESSAGES as M } from "./messages";
import { runReview } from "./run";

const REVIEW = { tripId: "trip-1", startedById: "u-cam", kind: "STANDARD", model: "claude-sonnet-5", status: "RUNNING" };
const USAGE = { inputTokens: 9_000, outputTokens: 1_500, cacheReadTokens: 0, cacheWriteTokens: 0, webSearchRequests: 2 };
const FLAG: Flag = { id: "item-closed-museum", severity: "warning", message: "Kyoto National Museum is closed that day.", targetType: "ITEM", targetId: "museum", date: "2026-11-02" };
const INPUT: ReviewInput = {
  tripName: "Autumn in Kyoto", startDate: "2026-11-01", endDate: "2026-11-06", today: "2026-10-18", plan: "{}", flags: [FLAG],
  targets: { STOP: new Set(["kyoto"]), ITEM: new Set(["museum", "kiyomizu"]), TRANSPORT: new Set(), ACCOMMODATION: new Set() },
};
const OUTPUT = {
  summary: "One holiday to plan around.",
  findings: [{ severity: "info", category: "HOLIDAY", targetType: "DAY", targetId: null, date: "2026-11-03", title: "Culture Day is a public holiday", detail: "Expect crowds at Kiyomizu-dera.", source: null, suggestedFix: null }],
};
const SPENT = { tripId: "trip-1", userId: "u-cam", model: "claude-sonnet-5", usage: USAGE, durationMs: 0, route: "review#usage" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  m.findUnique.mockResolvedValue(REVIEW);
  m.isAiConfigured.mockReturnValue(true);
  m.buildReviewInput.mockResolvedValue(INPUT);
  m.callReviewModel.mockResolvedValue({ kind: "ok", usage: USAGE, output: OUTPUT });
  m.recordAiUsage.mockResolvedValue("use-1");
  m.saveReviewResult.mockResolvedValue({ saved: true, findingCount: 2 });
});

describe("runReview (spec 2026-10-17 R8, R11)", () => {
  it("reads the plan, calls Claude inside the time budget, records the spend, and saves the restated Flags then Claude's Findings", async () => {
    await runReview("rev-1");
    expect(m.findUnique).toHaveBeenCalledWith({ where: { id: "rev-1" }, select: { tripId: true, startedById: true, kind: true, model: true, status: true } });
    expect(m.buildReviewInput).toHaveBeenCalledWith("trip-1");
    expect(m.callReviewModel).toHaveBeenCalledWith({ kind: "STANDARD", model: "claude-sonnet-5", input: INPUT, deadline: 1_270_000 });
    expect(m.recordAiUsage).toHaveBeenCalledWith({ ...SPENT, proposalCount: 1, outcome: "ok" });
    const [id, drafts, result] = m.saveReviewResult.mock.calls[0];
    expect(id).toBe("rev-1");
    expect(drafts.map((d: { origin: string }) => d.origin)).toEqual(["FLAG", "MODEL"]);
    expect(drafts[1]).toMatchObject({ category: "HOLIDAY", targetType: "DAY", date: "2026-11-03" });
    expect(result).toEqual({ summary: "One holiday to plan around.", aiUsageId: "use-1" });
    expect(m.failReview).not.toHaveBeenCalled();
  });

  it("does nothing for a Review that is gone or no longer running", async () => {
    m.findUnique.mockResolvedValueOnce(null);
    await runReview("rev-1");
    m.findUnique.mockResolvedValueOnce({ ...REVIEW, status: "FAILED" });
    await runReview("rev-1");
    expect(m.callReviewModel).not.toHaveBeenCalled();
    expect(m.failReview).not.toHaveBeenCalled();
  });

  it("fails without calling Claude when Reviews are not set up", async () => {
    m.isAiConfigured.mockReturnValue(false);
    await runReview("rev-1");
    expect(m.callReviewModel).not.toHaveBeenCalled();
    expect(m.recordAiUsage).not.toHaveBeenCalled();
    expect(m.failReview).toHaveBeenCalledWith("rev-1", M.notSetUp, null);
  });

  it("fails without calling Claude when the starter's account is gone (no one to bill the spend to)", async () => {
    m.findUnique.mockResolvedValueOnce({ ...REVIEW, startedById: null });
    await runReview("rev-1");
    expect(m.callReviewModel).not.toHaveBeenCalled();
    expect(m.recordAiUsage).not.toHaveBeenCalled();
    expect(m.failReview).toHaveBeenCalledWith("rev-1", M.failed, null);
  });

  it.each([
    [{ kind: "busy", usage: USAGE }, "api_error", M.busy],
    [{ kind: "api_error", usage: USAGE, status: 400 }, "api_error", M.failed],
    [{ kind: "unreadable", usage: USAGE, report: new Error("Review: the reply failed validation") }, "unreadable", M.unreadable],
    [{ kind: "timeout", usage: USAGE }, "timed_out", M.timeout],
  ])("a %o run records its spend as %s and fails with its reason", async (outcome, usageOutcome, reason) => {
    m.callReviewModel.mockResolvedValue(outcome);
    await runReview("rev-1");
    expect(m.recordAiUsage).toHaveBeenCalledWith({ ...SPENT, proposalCount: 0, outcome: usageOutcome });
    expect(m.failReview).toHaveBeenCalledWith("rev-1", reason, "use-1");
    expect(m.saveReviewResult).not.toHaveBeenCalled();
  });

  it("reports an API error's status and an unreadable reply's fixed report, never a busy one", async () => {
    m.callReviewModel.mockResolvedValueOnce({ kind: "api_error", usage: USAGE, status: 400 });
    await runReview("rev-1");
    expect(m.reportError).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Review: Anthropic API error 400" }), { route: "review", source: "server", userId: "u-cam" });
    const report = new Error("Review: stop_reason refusal");
    m.callReviewModel.mockResolvedValueOnce({ kind: "unreadable", usage: USAGE, report });
    await runReview("rev-1");
    expect(m.reportError).toHaveBeenLastCalledWith(report, { route: "review", source: "server", userId: "u-cam" });
    m.reportError.mockClear();
    m.callReviewModel.mockResolvedValueOnce({ kind: "busy", usage: USAGE });
    await runReview("rev-1");
    expect(m.reportError).not.toHaveBeenCalled();
  });

  it("a finish the store refuses (the row went stale or was failed meanwhile) still links the spend if the row is RUNNING", async () => {
    m.saveReviewResult.mockResolvedValueOnce({ saved: false, findingCount: 0 });
    await runReview("rev-1");
    expect(m.failReview).toHaveBeenCalledWith("rev-1", M.stale, "use-1");
  });

  it("never throws: a crash before the call fails the Review with no spend row, reported with a fresh error", async () => {
    const crash = new TypeError("cannot read plan of Ryokan");
    m.buildReviewInput.mockRejectedValueOnce(crash);
    await expect(runReview("rev-1")).resolves.toBeUndefined();
    expect(m.failReview).toHaveBeenCalledWith("rev-1", M.failed, null);
    expect(m.reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "Review job failed (TypeError)" }), expect.objectContaining({ route: "review", userId: "u-cam" }));
    expect(m.reportError.mock.calls[0][0]).not.toBe(crash);
  });

  it("records the spend before cleaning the reply: a throw there still leaves the usage row on the failed Review (parked 1)", async () => {
    const order: string[] = [];
    m.recordAiUsage.mockImplementationOnce(async () => (order.push("usage"), "use-1"));
    // No targets: toFindingDrafts throws on the ITEM Finding.
    m.buildReviewInput.mockResolvedValueOnce({ ...INPUT, targets: undefined });
    m.callReviewModel.mockResolvedValueOnce({ kind: "ok", usage: USAGE, output: { ...OUTPUT, findings: [{ ...OUTPUT.findings[0], targetType: "ITEM", targetId: "museum" }] } });
    m.failReview.mockImplementationOnce(async () => void order.push("fail"));
    await runReview("rev-1");
    expect(m.recordAiUsage).toHaveBeenCalledWith({ ...SPENT, proposalCount: 1, outcome: "ok" });
    expect(order).toEqual(["usage", "fail"]);
    expect(m.failReview).toHaveBeenCalledWith("rev-1", M.failed, "use-1");
    expect(m.saveReviewResult).not.toHaveBeenCalled();
  });

  it("a crash while saving keeps the spend row on the failed Review", async () => {
    m.saveReviewResult.mockRejectedValueOnce(new Error("db down"));
    await runReview("rev-1");
    expect(m.failReview).toHaveBeenCalledWith("rev-1", M.failed, "use-1");
  });

  it("never throws even when reporting the crash fails too", async () => {
    m.findUnique.mockRejectedValueOnce(new Error("db down"));
    m.reportError.mockRejectedValueOnce(new Error("sink down"));
    await expect(runReview("rev-1")).resolves.toBeUndefined();
    expect(m.failReview).toHaveBeenCalledWith("rev-1", M.failed, null);
  });
});
