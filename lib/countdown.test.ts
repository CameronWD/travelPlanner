import { describe, expect, it } from "vitest";
import { countdownFor, countdownLabel, firstLegLine } from "@/lib/countdown";

const TRIP = { startDate: "2026-12-04", endDate: "2027-01-08" };

describe("countdownFor", () => {
  it("counts sleeps to go before departure", () => {
    expect(countdownFor({ ...TRIP, today: "2026-09-27" })).toEqual({ kind: "sleeps", n: 68, unit: "sleeps" });
  });

  it("uses the singular for one sleep", () => {
    expect(countdownFor({ ...TRIP, today: "2026-12-03" })).toEqual({ kind: "sleeps", n: 1, unit: "sleep" });
  });

  it("is today on the start date", () => {
    expect(countdownFor({ ...TRIP, today: "2026-12-04" })).toEqual({ kind: "today" });
  });

  it("counts the day of the trip inclusively while travelling (same base as describePhase)", () => {
    expect(countdownFor({ ...TRIP, today: "2026-12-08" })).toEqual({ kind: "day", n: 5, of: 36 });
    expect(countdownFor({ ...TRIP, today: "2027-01-08" })).toEqual({ kind: "day", n: 36, of: 36 });
  });

  it("is home after the end date", () => {
    expect(countdownFor({ ...TRIP, today: "2027-01-09" })).toEqual({ kind: "home" });
  });

  it("has no dates for a date-less trip", () => {
    expect(countdownFor({ startDate: null, endDate: null, today: "2026-09-27" })).toEqual({ kind: "no-dates" });
  });

  it("falls back to the start date when there is no end date", () => {
    expect(countdownFor({ startDate: "2026-12-04", endDate: null, today: "2026-12-05" })).toEqual({ kind: "home" });
  });
});

describe("countdownFor — rough month", () => {
  it("a date-less trip with a rough month reads Sometime in", () => {
    const c = countdownFor({ startDate: null, endDate: null, today: "2026-09-30", roughMonth: "2027-04" });
    expect(c).toEqual({ kind: "rough-month", month: "April" });
    expect(countdownLabel(c)).toBe("Sometime in April");
  });
  it("a start date wins over a stale rough month", () => {
    expect(countdownFor({ startDate: "2026-12-04", endDate: null, today: "2026-09-30", roughMonth: "2027-04" }).kind).toBe("sleeps");
  });
  it("no rough month is still no-dates", () => {
    expect(countdownFor({ startDate: null, endDate: null, today: "2026-09-30", roughMonth: null }).kind).toBe("no-dates");
  });
});

describe("firstLegLine", () => {
  const firstStop = { name: "Denpasar, Bali" };

  it("shows the first leg's day, then origin → first stop", () => {
    expect(
      firstLegLine({
        transport: { depDate: "2026-12-04", origin: null, destination: "Denpasar, Bali" },
        homeName: "Sydney",
        firstStop,
      }),
    ).toBe("Fri 4 Dec · Sydney → Denpasar, Bali");
  });

  it("uses the leg's own origin over the home base", () => {
    expect(
      firstLegLine({
        transport: { depDate: "2026-12-04", origin: "Melbourne", destination: null },
        homeName: "Sydney",
        firstStop,
      }),
    ).toBe("Fri 4 Dec · Melbourne → Denpasar, Bali");
  });

  it("drops the day when the leg has no departure time", () => {
    expect(
      firstLegLine({ transport: { depDate: null, origin: null, destination: null }, homeName: "Sydney", firstStop }),
    ).toBe("Sydney → Denpasar, Bali");
  });

  it("shows just the first Stop's name with no leg", () => {
    expect(firstLegLine({ transport: null, homeName: "Sydney", firstStop })).toBe("Denpasar, Bali");
  });

  it("is null with no leg and no Stops", () => {
    expect(firstLegLine({ transport: null, homeName: "Sydney", firstStop: null })).toBeNull();
  });
});
