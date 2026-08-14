import { describe, it, expect } from "vitest";
import { wallTimeToInstant } from "@/lib/wall-time";

describe("wallTimeToInstant", () => {
  it("interprets an offset-less wall time in the given zone, independent of process TZ", () => {
    expect(wallTimeToInstant("2026-07-01T08:00", "Europe/Paris")!.toISOString())
      .toBe("2026-07-01T06:00:00.000Z"); // CEST = UTC+2
    expect(wallTimeToInstant("2026-07-01T08:00", "Australia/Sydney")!.toISOString())
      .toBe("2026-06-30T22:00:00.000Z"); // AEST = UTC+10
  });
  it("passes Date instances through untouched", () => {
    const d = new Date("2026-07-01T06:00:00Z");
    expect(wallTimeToInstant(d, "Europe/Paris")).toBe(d);
  });
  it("accepts seconds and returns null for null/undefined/garbage", () => {
    expect(wallTimeToInstant("2026-07-01T08:00:30", "UTC")!.toISOString())
      .toBe("2026-07-01T08:00:00.000Z");
    expect(wallTimeToInstant(null, "UTC")).toBeNull();
    expect(wallTimeToInstant(undefined, "UTC")).toBeNull();
    expect(wallTimeToInstant("not-a-time", "UTC")).toBeNull();
  });
  it("returns null for a shape-valid but calendrically-invalid wall time instead of an Invalid Date", () => {
    expect(wallTimeToInstant("2026-13-45T99:99", "UTC")).toBeNull();
  });
});
