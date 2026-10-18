import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
  latestReview: vi.fn(), getReview: vi.fn(), listReviews: vi.fn(), runningReview: vi.fn(),
}));
const perm = vi.hoisted(() => ({ reviewPermissionOf: vi.fn(), countedReviewStarts: vi.fn() }));
const ai = vi.hoisted(() => ({ isAiConfigured: vi.fn(() => true) }));
vi.mock("@/lib/review-reads", () => reads);
vi.mock("@/lib/review-permission-reads", () => perm);
vi.mock("@/lib/ai", () => ai);

import { loadReviewsPage } from "./reviews-page-loader";

const CAM = { id: "u1", name: "Cam Williams" };
const NOW = new Date("2026-10-18T00:00:00Z");
const AT = new Date("2026-10-17T04:05:00Z");
// R's categories are the eight UPPERCASE values (R8); state drives canDismiss here only for realism, not asserted on.
const finding = (id: string, state: string, severity = "warning") => ({
  id, reviewId: "r2", severity, category: "CLOSURE", targetType: "TRIP", targetId: null, date: null,
  title: `T ${id}`, detail: "d", suggestedFix: null, source: null, origin: "MODEL", state, stateAt: null, stateBy: null,
  canApply: false, canDismiss: state === "OPEN", canUndo: false,
});
const review = (id: string, o: Record<string, unknown> = {}) => ({
  id, tripId: "t1", kind: "STANDARD", model: "claude-sonnet-5", status: "DONE", summary: `Summary ${id}`, error: null,
  startedAt: AT, finishedAt: AT, startedBy: CAM, findings: [], ...o,
});
const input = (o: Partial<Parameters<typeof loadReviewsPage>[0]> = {}) => ({
  tripId: "t1", userId: "u1", base: "/trips/xmas", timeZone: "Australia/Brisbane", reviewId: null, now: NOW, ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  ai.isAiConfigured.mockReturnValue(true);
  perm.reviewPermissionOf.mockResolvedValue("UNLIMITED");
  perm.countedReviewStarts.mockResolvedValue([]);
  reads.runningReview.mockResolvedValue(null);
  reads.listReviews.mockResolvedValue([review("r2"), review("r1")]);
  reads.latestReview.mockResolvedValue(review("r2", { findings: [finding("a", "OPEN"), finding("b", "DISMISSED"), finding("c", "OPEN", "info")] }));
  reads.getReview.mockResolvedValue(null);
});

describe("loadReviewsPage", () => {
  it("shows the latest finished Review, actionable, with its groups and open count", async () => {
    const m = (await loadReviewsPage(input()))!;
    expect(m.shown).toMatchObject({ id: "r2", heading: "Standard Review", byLine: "Run by Cam, Sat 17 Oct, 14:05", openCount: 2, actionable: true, isLatest: true, summary: "Summary r2" });
    expect(m.shown!.open.map((g) => g.heading)).toEqual(["Warnings", "Notes"]);
    expect(m.shown!.dealtWith.map((c) => c.id)).toEqual(["b"]);
    expect(m.history.map((h) => [h.id, h.current])).toEqual([["r2", true], ["r1", false]]);
    expect(m.panel).toEqual({ kind: "ready" });
    expect(m.running).toBeNull();
  });

  it("?review= opens an older one read-only", async () => {
    reads.getReview.mockResolvedValue(review("r1", { findings: [finding("x", "GONE")] }));
    const m = (await loadReviewsPage(input({ reviewId: "r1" })))!;
    expect(reads.getReview).toHaveBeenCalledWith("r1");
    expect(m.shown).toMatchObject({ id: "r1", actionable: false, isLatest: false, openCount: 0 });
    expect(m.history.find((h) => h.id === "r1")!.current).toBe(true);
  });

  it("null for a Review that exists but belongs to another Trip", async () => {
    reads.getReview.mockResolvedValue(review("rx", { tripId: "other" }));
    expect(await loadReviewsPage(input({ reviewId: "rx" }))).toBeNull();
  });

  it("a reviewId naming no Review at all propagates lib/review-reads.ts's own notFound guard, rather than this loader re-implementing it", async () => {
    reads.getReview.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(loadReviewsPage(input({ reviewId: "gone" }))).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("a running Review: the line for everyone, and the panel is busy", async () => {
    reads.runningReview.mockResolvedValue(review("r3", { status: "RUNNING", summary: null, finishedAt: null }));
    const m = (await loadReviewsPage(input()))!;
    expect(m.running).toEqual({ id: "r3", line: "Reviewing… (started by Cam)" });
    expect(m.panel).toEqual({ kind: "busy" });
  });

  it("Off: the panel is hidden and counted runs are never read; reading still works", async () => {
    perm.reviewPermissionOf.mockResolvedValue("OFF");
    const m = (await loadReviewsPage(input()))!;
    expect(m.panel).toEqual({ kind: "hidden" });
    expect(perm.countedReviewStarts).not.toHaveBeenCalled();
    expect(m.shown?.id).toBe("r2");
  });

  it("Limited reads the last 7 days of counted runs and caps", async () => {
    perm.reviewPermissionOf.mockResolvedValue("LIMITED");
    perm.countedReviewStarts.mockResolvedValue([new Date("2026-10-17T20:00:00Z")]);
    const m = (await loadReviewsPage(input()))!;
    expect(perm.countedReviewStarts).toHaveBeenCalledWith("u1", new Date("2026-10-11T00:00:00Z"));
    expect(m.panel.kind).toBe("capped");
  });

  it("no API key: not set up", async () => {
    ai.isAiConfigured.mockReturnValue(false);
    expect((await loadReviewsPage(input()))!.panel).toEqual({ kind: "not-configured" });
  });

  it("a FAILED Review: the shown block and the newest run carry its reason (final wave I2)", async () => {
    const error = "Claude was busy, so this Review stopped. Start it again in a few minutes.";
    reads.listReviews.mockResolvedValue([review("r3", { status: "FAILED", summary: null, error }), review("r2")]);
    reads.getReview.mockResolvedValue(review("r3", { status: "FAILED", summary: null, error }));
    const m = (await loadReviewsPage(input({ reviewId: "r3" })))!;
    expect(m.shown).toMatchObject({ status: "FAILED", failure: `This Review didn't finish. ${error} Nothing on the trip was changed.` });
    expect(m.latestRun).toEqual({ id: "r3", status: "FAILED", error });
    expect(m.history[0].line).toBe(`Didn't finish: ${error}`);
    // A finished one has no failure line.
    expect((await loadReviewsPage(input()))!.shown!.failure).toBeNull();
  });

  it("no Reviews yet", async () => {
    reads.latestReview.mockResolvedValue(null);
    reads.listReviews.mockResolvedValue([]);
    const m = (await loadReviewsPage(input()))!;
    expect(m.shown).toBeNull();
    expect(m.history).toEqual([]);
  });
});
