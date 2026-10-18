import { describe, expect, it } from "vitest";
import {
  FINDING_CATEGORIES,
  FINDING_CATEGORY_LABELS,
  FINDING_STATE_LABELS,
  FINDING_STATES,
  REVIEW_KIND_LABELS,
  REVIEW_STALE_AFTER_MS,
  effectiveReviewStatus,
} from "./types";

describe("effectiveReviewStatus (a stale run never blocks the Trip)", () => {
  const startedAt = new Date("2026-10-19T10:00:00Z");
  const at = (ms: number) => new Date(startedAt.getTime() + ms);

  it("is 6 minutes", () => {
    expect(REVIEW_STALE_AFTER_MS).toBe(6 * 60 * 1000);
  });

  it("a RUNNING row younger than 6 minutes is running", () => {
    expect(effectiveReviewStatus("RUNNING", startedAt, at(REVIEW_STALE_AFTER_MS - 1))).toBe("RUNNING");
  });

  it("a RUNNING row 6 minutes old reads as FAILED", () => {
    expect(effectiveReviewStatus("RUNNING", startedAt, at(REVIEW_STALE_AFTER_MS))).toBe("FAILED");
  });

  it("DONE and FAILED are what they say, whatever their age", () => {
    expect(effectiveReviewStatus("DONE", startedAt, at(10 * REVIEW_STALE_AFTER_MS))).toBe("DONE");
    expect(effectiveReviewStatus("FAILED", startedAt, at(0))).toBe("FAILED");
  });
});

describe("labels", () => {
  it("R8's eight categories, each labelled", () => {
    expect(FINDING_CATEGORIES).toEqual(["CLOSURE", "SEASON", "TICKET", "HOLIDAY", "LOGISTICS", "STALE_NOTE", "PACKING", "BOOKING"]);
    for (const c of FINDING_CATEGORIES) expect(FINDING_CATEGORY_LABELS[c]).toMatch(/^\S/);
  });

  it("R10's four states; GONE reads No longer found", () => {
    expect(FINDING_STATES).toEqual(["OPEN", "APPLIED", "DISMISSED", "GONE"]);
    expect(FINDING_STATE_LABELS).toEqual({ OPEN: "Open", APPLIED: "Applied", DISMISSED: "Dismissed", GONE: "No longer found" });
  });

  it("R11's two kinds", () => {
    expect(REVIEW_KIND_LABELS).toEqual({ STANDARD: "Standard Review", DEEP: "Deep Review" });
  });
});
