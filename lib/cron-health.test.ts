import { describe, expect, it } from "vitest";
import {
  isDispatcherStale,
  isDispatcherUnhealthy,
  formatLastRun,
  DISPATCHER_STALE_AFTER_HOURS,
} from "./cron-health";

const now = new Date("2026-12-10T12:00:00Z");

describe("isDispatcherStale", () => {
  it("is not stale a few hours after a run", () => {
    expect(isDispatcherStale(new Date("2026-12-10T06:00:00Z"), now)).toBe(false);
  });

  it("tolerates GitHub delaying a scheduled run", () => {
    // The workflow matches a three-hour local window, not an exact hour, so a
    // tight threshold would cry wolf. 24h means four scheduled runs missed.
    expect(isDispatcherStale(new Date("2026-12-09T13:00:00Z"), now)).toBe(false);
  });

  it("is stale past the threshold", () => {
    expect(isDispatcherStale(new Date("2026-12-09T11:00:00Z"), now)).toBe(true);
  });

  it("treats never-having-run as stale", () => {
    expect(isDispatcherStale(null, now)).toBe(true);
  });

  it("exposes the threshold so the copy and the test agree", () => {
    expect(DISPATCHER_STALE_AFTER_HOURS).toBe(24);
  });
});

describe("formatLastRun", () => {
  it("says so plainly when it has never run", () => {
    expect(formatLastRun(null, now)).toBe("never run");
  });

  it("reads as reassurance while healthy", () => {
    expect(formatLastRun(new Date("2026-12-10T10:00:00Z"), now)).toBe("last ran 2 hours ago");
  });

  it("switches to a date once stale, which reads as a question", () => {
    expect(formatLastRun(new Date("2026-12-01T10:00:00Z"), now)).toBe("last ran 1 Dec 2026");
  });

  it("says one hour in the singular", () => {
    // The `hours === 1` branch: `${hours} ${hours === 1 ? "hour" : "hours"}`.
    // Only the plural side was ever exercised, so "1 hours ago" would ship.
    expect(formatLastRun(new Date("2026-12-10T11:00:00Z"), now)).toBe("last ran 1 hour ago");
  });

  it("reads as 'just now' under the hour", () => {
    expect(formatLastRun(new Date("2026-12-10T11:30:00Z"), now)).toBe("last ran just now");
  });

  it("reads as 'just now' at the instant of the run", () => {
    // Math.max(0, ...) guards a clock that ran backwards; this is the 0 case.
    expect(formatLastRun(new Date("2026-12-10T12:00:00Z"), now)).toBe("last ran just now");
  });

  it("is still 'just now' one second short of the hour", () => {
    expect(formatLastRun(new Date("2026-12-10T11:00:01Z"), now)).toBe("last ran just now");
  });

  it("reads a future lastRunAt (clock skew) as 'just now', not negative hours", () => {
    // Every other case above has lastRunAt at or before `now`; this is the
    // only one where the clock has run backwards relative to the run. Note:
    // this passes with or without the `Math.max(0, ...)` in the implementation
    // — the `hours >= 1` guard on the "N hours ago" branch already excludes
    // every negative value, so `Math.max(0, ...)` is provably unreachable for
    // this function's return value (verified by removing it and sweeping the
    // full range of `diff`, with no output change). This test pins the
    // observable behaviour (future timestamps read as "just now"), not the
    // `Math.max` call itself.
    const later = new Date("2026-12-10T13:00:00Z");
    expect(formatLastRun(later, now)).toBe("last ran just now");
  });
});

describe("isDispatcherUnhealthy", () => {
  const now = new Date("2026-09-21T12:00:00Z");

  it("is unhealthy when the route ran but nothing was ever dispatched", () => {
    expect(isDispatcherUnhealthy(new Date("2026-09-21T11:00:00Z"), null, now)).toBe(true);
  });

  it("is unhealthy when dispatch succeeded long ago but the route ran just now", () => {
    expect(
      isDispatcherUnhealthy(
        new Date("2026-09-21T11:00:00Z"),
        new Date("2026-09-19T11:00:00Z"),
        now,
      ),
    ).toBe(true);
  });

  it("is healthy when both signals are fresh", () => {
    expect(
      isDispatcherUnhealthy(
        new Date("2026-09-21T11:00:00Z"),
        new Date("2026-09-21T11:00:00Z"),
        now,
      ),
    ).toBe(false);
  });
});
