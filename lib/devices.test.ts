import { describe, expect, it } from "vitest";
import {
  DEVICE_STALE_AFTER_DAYS,
  DEVICE_TOUCH_AFTER_MS,
  formatLastSeen,
  isDeviceStale,
  needsTouch,
} from "@/lib/devices";

const NOW = new Date("2026-09-17T10:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000);

describe("isDeviceStale", () => {
  it("is false for a device seen today", () => {
    expect(isDeviceStale(NOW, NOW)).toBe(false);
  });

  it("is false right up to the threshold", () => {
    expect(isDeviceStale(daysAgo(DEVICE_STALE_AFTER_DAYS - 1), NOW)).toBe(false);
  });

  it("is true past the threshold", () => {
    expect(isDeviceStale(daysAgo(DEVICE_STALE_AFTER_DAYS + 1), NOW)).toBe(true);
  });

  // A clock skew between browser and server must not invent staleness.
  it("is false for a future timestamp", () => {
    expect(isDeviceStale(new Date(NOW.getTime() + 60_000), NOW)).toBe(false);
  });
});

describe("needsTouch", () => {
  it("is false for a device seen within the window", () => {
    expect(needsTouch(hoursAgo(1), NOW)).toBe(false);
  });

  it("is true once the window has passed", () => {
    expect(needsTouch(new Date(NOW.getTime() - DEVICE_TOUCH_AFTER_MS - 1), NOW)).toBe(true);
  });
});

describe("formatLastSeen", () => {
  it("says just now inside the hour", () => {
    expect(formatLastSeen(hoursAgo(0), NOW)).toBe("seen just now");
  });

  it("counts hours, then days", () => {
    expect(formatLastSeen(hoursAgo(3), NOW)).toBe("seen 3 hours ago");
    expect(formatLastSeen(daysAgo(1), NOW)).toBe("seen 1 day ago");
    expect(formatLastSeen(daysAgo(4), NOW)).toBe("seen 4 days ago");
  });

  // Past the threshold the wording changes from a reassurance to a warning:
  // "seen 20 days ago" reads as fine, "unseen since" reads as a question.
  it("switches to a date once stale", () => {
    expect(formatLastSeen(daysAgo(20), NOW)).toBe("unseen since 28 Aug 2026");
  });
});
