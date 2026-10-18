import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ markReviewFailed: vi.fn(), reportError: vi.fn() }));
vi.mock("@/lib/review-store", () => ({ markReviewFailed: m.markReviewFailed }));
vi.mock("@/lib/error-sink", () => ({ reportError: m.reportError }));

import { failReview } from "./fail";
import { REVIEW_MESSAGES } from "./messages";
import { REVIEW_STALE_ERROR } from "./types";

beforeEach(() => {
  vi.resetAllMocks();
  m.markReviewFailed.mockResolvedValue(true);
});

describe("failReview", () => {
  it("marks a still-RUNNING Review FAILED with the reason and the spend row (markReviewFailed only moves a RUNNING row)", async () => {
    await failReview("rev-1", REVIEW_MESSAGES.busy, "use-1");
    expect(m.markReviewFailed).toHaveBeenCalledWith("rev-1", REVIEW_MESSAGES.busy, { aiUsageId: "use-1" });
  });

  it("never throws; a failed write is reported with a fixed message, not the original", async () => {
    const dbError = new Error("db down");
    m.markReviewFailed.mockRejectedValueOnce(dbError);
    await expect(failReview("rev-1", REVIEW_MESSAGES.failed, null)).resolves.toBeUndefined();
    expect(m.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Review not marked failed" }),
      expect.objectContaining({ route: "review", source: "server" }),
    );
    expect(m.reportError.mock.calls[0][0]).not.toBe(dbError);
  });
});

describe("REVIEW_MESSAGES", () => {
  it("names a stale run the way the history does", () => {
    expect(REVIEW_MESSAGES.stale).toBe(REVIEW_STALE_ERROR);
  });
});
