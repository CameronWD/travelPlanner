import { afterEach, describe, expect, it, vi } from "vitest";
import { tripTodayISO } from "./trip-today";

const stop = (id: string, sortOrder: number, timezone: string, arriveDate: string, departDate: string) => ({
  id,
  sortOrder,
  timezone,
  arriveDate,
  departDate,
});

describe("tripTodayISO", () => {
  afterEach(() => vi.useRealTimers());

  it("is UTC's today when nothing is dated", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T23:30:00Z"));
    expect(tripTodayISO([])).toBe("2026-09-27");
  });

  it("uses the current Stop's zone — a far-east Stop is already on tomorrow", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T23:30:00Z"));
    expect(tripTodayISO([stop("a", 0, "Pacific/Auckland", "2026-09-20", "2026-10-05")])).toBe("2026-09-28");
  });

  it("orders Stops by plan order (dates) before picking the current one, regardless of sortOrder", () => {
    vi.useFakeTimers();
    // 23:30 UTC on 27 Sep: 28 Sep in Auckland, 27 Sep in Los Angeles.
    vi.setSystemTime(new Date("2026-09-27T23:30:00Z"));
    // sortOrder puts the LATER (LA) stop first; plan order must put the
    // Auckland stop (dated earlier, still current) first.
    const stops = [
      stop("la", 0, "America/Los_Angeles", "2026-10-06", "2026-10-10"),
      stop("akl", 1, "Pacific/Auckland", "2026-09-20", "2026-10-05"),
    ];
    expect(tripTodayISO(stops)).toBe("2026-09-28");
  });
});
