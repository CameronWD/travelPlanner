import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

const sec = (n: number) => n * 1_000;
const min = (n: number) => n * 60_000;
const hr = (n: number) => n * 3_600_000;
const day = (n: number) => n * 86_400_000;

function makeDate(nowMs: number, diffMs: number) {
  return new Date(nowMs - diffMs);
}

describe("relativeTime", () => {
  const NOW = new Date("2025-06-15T12:00:00.000Z");
  const nowMs = NOW.getTime();

  it("returns 'just now' for 0 seconds ago", () => {
    expect(relativeTime(makeDate(nowMs, 0), NOW)).toBe("just now");
  });

  it("returns 'just now' for 30 seconds ago", () => {
    expect(relativeTime(makeDate(nowMs, sec(30)), NOW)).toBe("just now");
  });

  it("returns 'just now' for 59 seconds ago", () => {
    expect(relativeTime(makeDate(nowMs, sec(59)), NOW)).toBe("just now");
  });

  it("returns '1m ago' for exactly 60 seconds ago", () => {
    expect(relativeTime(makeDate(nowMs, sec(60)), NOW)).toBe("1m ago");
  });

  it("returns '5m ago' for 5 minutes ago", () => {
    expect(relativeTime(makeDate(nowMs, min(5)), NOW)).toBe("5m ago");
  });

  it("returns '59m ago' for 59 minutes ago", () => {
    expect(relativeTime(makeDate(nowMs, min(59)), NOW)).toBe("59m ago");
  });

  it("returns '1h ago' for exactly 60 minutes ago", () => {
    expect(relativeTime(makeDate(nowMs, hr(1)), NOW)).toBe("1h ago");
  });

  it("returns '3h ago' for 3 hours ago", () => {
    expect(relativeTime(makeDate(nowMs, hr(3)), NOW)).toBe("3h ago");
  });

  it("returns '23h ago' for 23 hours ago", () => {
    expect(relativeTime(makeDate(nowMs, hr(23)), NOW)).toBe("23h ago");
  });

  it("returns '1d ago' for exactly 24 hours ago", () => {
    expect(relativeTime(makeDate(nowMs, day(1)), NOW)).toBe("1d ago");
  });

  it("returns '6d ago' for 6 days ago", () => {
    expect(relativeTime(makeDate(nowMs, day(6)), NOW)).toBe("6d ago");
  });

  it("returns a formatted date for 7+ days ago", () => {
    const result = relativeTime(makeDate(nowMs, day(7)), NOW);
    // Should contain the year, not a relative string
    expect(result).toMatch(/2025/);
    expect(result).not.toMatch(/ago/);
  });

  it("returns a formatted date for 30 days ago", () => {
    const result = relativeTime(makeDate(nowMs, day(30)), NOW);
    expect(result).toMatch(/2025/);
    expect(result).not.toMatch(/ago/);
  });

  it("defaults now to the current date when not provided", () => {
    // Just ensure no crash — the result will vary by time but should be a string
    const result = relativeTime(new Date(Date.now() - sec(5)));
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
