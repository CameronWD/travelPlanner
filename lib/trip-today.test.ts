import { afterEach, describe, expect, it, vi } from "vitest";
import { computeTripPhase } from "./trip-phase";
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

describe("tripTodayISO with a Home timezone", () => {
  afterEach(() => vi.useRealTimers());
  const BNE = "Australia/Brisbane";
  const outbound = [stop("dps", 0, "Asia/Makassar", "2026-12-04", "2026-12-10")];
  const inbound = [stop("rome", 0, "Europe/Rome", "2026-12-20", "2027-01-07")];
  const at = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it("is already departure day in Home before the first Stop's zone gets there", () => {
    at("2026-12-03T15:00:00Z");
    expect(tripTodayISO(outbound)).toBe("2026-12-03");
    expect(tripTodayISO(outbound, BNE)).toBe("2026-12-04");
  });

  it("is the day after the return once Home has moved on, though the last Stop has not", () => {
    at("2027-01-07T22:00:00Z");
    expect(tripTodayISO(inbound)).toBe("2027-01-07");
    expect(tripTodayISO(inbound, BNE)).toBe("2027-01-08");
  });

  it("leaves mid-trip alone", () => {
    at("2026-12-06T20:00:00Z");
    expect(tripTodayISO(outbound, BNE)).toBe(tripTodayISO(outbound));
  });

  it("treats a null Home timezone as absent", () => {
    at("2026-12-03T15:00:00Z");
    expect(tripTodayISO(outbound, null)).toBe("2026-12-03");
  });

  it("flips the Phase to Travelling on departure morning in Home", () => {
    at("2026-12-03T15:00:00Z");
    const phaseOf = (home?: string) =>
      computeTripPhase({ startDate: "2026-12-04", endDate: "2026-12-10", today: tripTodayISO(outbound, home) });
    expect(phaseOf()).toBe("final-prep");
    expect(phaseOf(BNE)).toBe("travelling");
  });

  it("flips the Phase to Past once Home reaches the day after the return", () => {
    at("2027-01-07T22:00:00Z");
    const phaseOf = (home?: string) =>
      computeTripPhase({ startDate: "2026-12-20", endDate: "2027-01-07", today: tripTodayISO(inbound, home) });
    expect(phaseOf()).toBe("travelling");
    expect(phaseOf(BNE)).toBe("past");
  });
});
