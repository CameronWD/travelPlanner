import { describe, expect, it } from "vitest";
import { durationMinutes, formatDuration } from "./transport";

// ---------------------------------------------------------------------------
// durationMinutes
// ---------------------------------------------------------------------------

describe("durationMinutes", () => {
  it("returns correct minutes for a normal flight", () => {
    const dep = new Date("2026-07-01T08:00:00Z");
    const arr = new Date("2026-07-01T13:30:00Z");
    expect(durationMinutes(dep, arr)).toBe(330);
  });

  it("handles cross-midnight duration using full instants", () => {
    const dep = new Date("2026-07-01T22:00:00Z");
    const arr = new Date("2026-07-02T03:30:00Z");
    expect(durationMinutes(dep, arr)).toBe(330);
  });

  it("accepts ISO string inputs", () => {
    expect(
      durationMinutes("2026-07-01T10:00:00Z", "2026-07-01T10:45:00Z"),
    ).toBe(45);
  });

  it("returns null when depAt is null", () => {
    expect(durationMinutes(null, new Date())).toBeNull();
  });

  it("returns null when arrAt is undefined", () => {
    expect(durationMinutes(new Date(), undefined)).toBeNull();
  });

  it("returns null when both are missing", () => {
    expect(durationMinutes(null, null)).toBeNull();
  });

  it("returns null when arr is before dep (negative duration)", () => {
    const dep = new Date("2026-07-01T13:00:00Z");
    const arr = new Date("2026-07-01T08:00:00Z");
    expect(durationMinutes(dep, arr)).toBeNull();
  });

  it("returns 0 for identical timestamps (same instant)", () => {
    const ts = new Date("2026-07-01T10:00:00Z");
    expect(durationMinutes(ts, ts)).toBe(0);
  });

  it("returns null for an invalid date string", () => {
    expect(durationMinutes("not-a-date", "2026-07-01T10:00:00Z")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(330)).toBe("5h 30m");
  });

  it("formats minutes only when under an hour", () => {
    expect(formatDuration(45)).toBe("45m");
  });

  it("formats whole hours with no minutes", () => {
    expect(formatDuration(120)).toBe("2h");
  });

  it("formats exactly 60 minutes as 1h", () => {
    expect(formatDuration(60)).toBe("1h");
  });

  it("formats 0 minutes", () => {
    expect(formatDuration(0)).toBe("0m");
  });

  it("formats 1 minute", () => {
    expect(formatDuration(1)).toBe("1m");
  });

  it("formats 1h 1m", () => {
    expect(formatDuration(61)).toBe("1h 1m");
  });
});
