import { describe, expect, it } from "vitest";
import {
  REVIEW_DAY_WINDOW_MS,
  REVIEW_LIMIT_PER_DAY,
  REVIEW_LIMIT_PER_WEEK,
  REVIEW_STALE_AFTER_MS,
  REVIEW_WEEK_WINDOW_MS,
  countedSince,
  nextReviewLabel,
  parseReviewPermission,
  reviewAllowance,
} from "@/lib/review-permission";

const NOW = new Date("2026-10-18T10:00:00.000Z");
const H = 3_600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("limits (decision 2)", () => {
  it("are 1 per rolling day and 2 per rolling week; a running row goes stale after 6 minutes", () => {
    expect(REVIEW_LIMIT_PER_DAY).toBe(1);
    expect(REVIEW_LIMIT_PER_WEEK).toBe(2);
    expect(REVIEW_DAY_WINDOW_MS).toBe(24 * H);
    expect(REVIEW_WEEK_WINDOW_MS).toBe(7 * 24 * H);
    // Past the job's own 270 s abort and the platform's 300 s kill (final wave M5).
    expect(REVIEW_STALE_AFTER_MS).toBe(6 * 60_000);
  });

  it("countedSince is a week before now", () => {
    expect(countedSince(NOW)).toEqual(new Date("2026-10-11T10:00:00.000Z"));
  });
});

describe("parseReviewPermission", () => {
  it("passes the three values through and reads anything else as OFF", () => {
    expect(parseReviewPermission("OFF")).toBe("OFF");
    expect(parseReviewPermission("LIMITED")).toBe("LIMITED");
    expect(parseReviewPermission("UNLIMITED")).toBe("UNLIMITED");
    expect(parseReviewPermission("unlimited")).toBe("OFF");
    expect(parseReviewPermission("ADMIN")).toBe("OFF");
    expect(parseReviewPermission("")).toBe("OFF");
    expect(parseReviewPermission(null)).toBe("OFF");
    expect(parseReviewPermission(undefined)).toBe("OFF");
  });
});

describe("reviewAllowance", () => {
  it("Off never runs, whatever the history", () => {
    expect(reviewAllowance("OFF", [], NOW)).toEqual({ canRun: false, nextAvailableAt: null });
  });

  it("Unlimited always runs, with no next-available moment", () => {
    const many = [ago(1 * H), ago(2 * H), ago(3 * H), ago(4 * H)];
    expect(reviewAllowance("UNLIMITED", many, NOW)).toEqual({ canRun: true, nextAvailableAt: null });
  });

  it("Limited with no counted runs can run", () => {
    expect(reviewAllowance("LIMITED", [], NOW)).toEqual({ canRun: true, nextAvailableAt: null });
  });

  it("Limited is capped by the day window: next available 24h after that run", () => {
    const start = ago(5 * H);
    expect(reviewAllowance("LIMITED", [start], NOW)).toEqual({
      canRun: false,
      nextAvailableAt: new Date(start.getTime() + 24 * H),
    });
  });

  it("a run exactly 24h ago has left the day window (start > now - window)", () => {
    expect(reviewAllowance("LIMITED", [ago(24 * H)], NOW)).toEqual({ canRun: true, nextAvailableAt: null });
    expect(reviewAllowance("LIMITED", [ago(24 * H - 1)], NOW).canRun).toBe(false);
  });

  it("is capped by the week window with the day window empty: the oldest run + 7 days", () => {
    const oldest = ago(6 * 24 * H);
    const newer = ago(2 * 24 * H);
    expect(reviewAllowance("LIMITED", [newer, oldest], NOW)).toEqual({
      canRun: false,
      nextAvailableAt: new Date(oldest.getTime() + 7 * 24 * H),
    });
  });

  it("one run in the week and none today can run", () => {
    expect(reviewAllowance("LIMITED", [ago(3 * 24 * H)], NOW)).toEqual({ canRun: true, nextAvailableAt: null });
  });

  it("with both windows full, the later freeing moment wins", () => {
    // Day frees at +23h; week frees when the 6-days-ago run leaves, at +24h.
    const oldest = ago(6 * 24 * H);
    const recent = ago(1 * H);
    expect(reviewAllowance("LIMITED", [recent, oldest], NOW).nextAvailableAt).toEqual(
      new Date(oldest.getTime() + 7 * 24 * H),
    );
    // Day frees at +23h; week (runs 2h and 1h ago) frees at the 2h-ago run + 7 days.
    const a = ago(2 * H);
    expect(reviewAllowance("LIMITED", [recent, a], NOW).nextAvailableAt).toEqual(new Date(a.getTime() + 7 * 24 * H));
  });

  it("runs older than the week are ignored", () => {
    expect(reviewAllowance("LIMITED", [ago(8 * 24 * H), ago(9 * 24 * H)], NOW)).toEqual({ canRun: true, nextAvailableAt: null });
  });

  it("over the cap (moved down from Unlimited): next available when fewer than the limit remain", () => {
    const runs = [ago(5 * 24 * H), ago(4 * 24 * H), ago(3 * 24 * H)];
    // Week holds 3 against a limit of 2: it has room once the 4-days-ago run leaves.
    expect(reviewAllowance("LIMITED", runs, NOW).nextAvailableAt).toEqual(new Date(ago(4 * 24 * H).getTime() + 7 * 24 * H));
  });

  it("does not care about input order", () => {
    const x = [ago(1 * H), ago(6 * 24 * H)];
    expect(reviewAllowance("LIMITED", x, NOW)).toEqual(reviewAllowance("LIMITED", [...x].reverse(), NOW));
  });
});

describe("nextReviewLabel (the button at the cap)", () => {
  // NOW is Sunday 2026-10-18 10:00 UTC = 20:00 in Brisbane (UTC+10, no DST).
  const BNE = "Australia/Brisbane";

  it("names the weekday, in the given timezone", () => {
    // Wed 21 Oct 23:00 UTC is Thursday 09:00 in Brisbane.
    expect(nextReviewLabel(new Date("2026-10-21T23:00:00Z"), NOW, BNE)).toBe("Next Review available Thursday");
    expect(nextReviewLabel(new Date("2026-10-21T23:00:00Z"), NOW, "UTC")).toBe("Next Review available Wednesday");
  });

  it("says tomorrow for the next calendar day", () => {
    expect(nextReviewLabel(new Date("2026-10-19T09:00:00Z"), NOW, "UTC")).toBe("Next Review available tomorrow");
    // 13:00 UTC is 23:00 Sunday in Brisbane: still today there.
    expect(nextReviewLabel(new Date("2026-10-18T13:00:00Z"), NOW, BNE)).toBe("Next Review available today at 23:00");
  });

  it("gives the time for later the same day", () => {
    expect(nextReviewLabel(new Date("2026-10-18T15:40:00Z"), NOW, "UTC")).toBe("Next Review available today at 15:40");
  });

  it("says next <weekday> a week out, so it can't be read as today", () => {
    expect(nextReviewLabel(new Date("2026-10-25T09:00:00Z"), NOW, "UTC")).toBe("Next Review available next Sunday");
  });

  it("falls back to UTC for an unknown timezone", () => {
    expect(nextReviewLabel(new Date("2026-10-21T23:00:00Z"), NOW, "Mars/Olympus")).toBe("Next Review available Wednesday");
  });
});
