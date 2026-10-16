import { describe, expect, it, vi } from "vitest";
import { instantToZonedTime, zonedWallTimeToInstant } from "@/lib/tz";
import { keepWallTime, refileHomeEnds, refileHomeEndsTx, type HomeLeg, type RefileTx } from "./home-timezone-refile";

const SYD = "Australia/Sydney";
const BNE = "Australia/Brisbane";
const LIS = "Europe/Lisbon";
const at = (d: string, t: string, z: string) => zonedWallTimeToInstant(d, t, z);

const leg = (over: Partial<HomeLeg>): HomeLeg => ({
  id: "t1", depAt: null, arrAt: null, depIsHome: false, arrIsHome: false,
  fromTimezone: null, toTimezone: null, ...over,
});

describe("keepWallTime", () => {
  it("Sydney → Brisbane in December keeps 06:10 and moves the instant +1h (Sydney is on daylight time)", () => {
    const before = at("2026-12-10", "06:10", SYD);
    expect(before.toISOString()).toBe("2026-12-09T19:10:00.000Z");
    const after = keepWallTime(before, SYD, BNE);
    expect(after.toISOString()).toBe("2026-12-09T20:10:00.000Z");
    expect(instantToZonedTime(after, BNE)).toBe("06:10");
  });

  it("Sydney → Brisbane in July is the same offset, so the instant does not move", () => {
    const before = at("2026-07-10", "06:10", SYD);
    expect(keepWallTime(before, SYD, BNE).getTime()).toBe(before.getTime());
  });

  it("keeps the local date across midnight UTC (23:30 Sydney stays 23:30 on the 10th in Brisbane)", () => {
    const after = keepWallTime(at("2026-12-10", "23:30", SYD), SYD, BNE);
    expect(after.toISOString()).toBe("2026-12-10T13:30:00.000Z");
  });

  it("a local time that doesn't exist in the new zone (spring-forward gap) lands on the next valid time", () => {
    // 02:30 on 4 Oct 2026 doesn't exist in Sydney; Brisbane's 02:30 is the same instant as Sydney's 03:30.
    const before = at("2026-10-04", "02:30", BNE);
    const after = keepWallTime(before, BNE, SYD);
    expect(after.getTime()).toBe(before.getTime());
    expect(instantToZonedTime(after, SYD)).toBe("03:30");
  });

  it("the same zone returns the instant unchanged", () => {
    const i = at("2026-12-10", "06:10", SYD);
    expect(keepWallTime(i, SYD, SYD)).toBe(i);
  });
});

describe("refileHomeEnds", () => {
  it("re-files a Home departure and leaves the Stop arrival alone", () => {
    const depAt = at("2026-12-10", "06:10", SYD);
    const arrAt = at("2026-12-11", "07:15", LIS);
    const out = refileHomeEnds([leg({ depIsHome: true, toTimezone: LIS, depAt, arrAt })], SYD, BNE);
    expect(out).toEqual([{ id: "t1", depAt: at("2026-12-10", "06:10", BNE) }]);
  });

  it("re-files a Home arrival and leaves the Stop departure alone", () => {
    const depAt = at("2026-12-24", "09:00", LIS);
    const arrAt = at("2026-12-25", "21:40", SYD);
    const out = refileHomeEnds([leg({ arrIsHome: true, fromTimezone: LIS, depAt, arrAt })], SYD, BNE);
    expect(out).toEqual([{ id: "t1", arrAt: at("2026-12-25", "21:40", BNE) }]);
  });

  it("null → zone: a Home end typed in the fallback (the other end's Stop zone) keeps its shown time", () => {
    // With no Home zone the departure was written in Lisbon time (resolveEndpointZones' fallback).
    const depAt = at("2026-12-10", "06:10", LIS);
    expect(depAt.toISOString()).toBe("2026-12-10T06:10:00.000Z");
    const out = refileHomeEnds([leg({ depIsHome: true, toTimezone: LIS, depAt })], null, BNE);
    expect(out).toEqual([{ id: "t1", depAt: at("2026-12-10", "06:10", BNE) }]);
    expect(out[0].depAt!.toISOString()).toBe("2026-12-09T20:10:00.000Z");
  });

  it("null → zone with no Stop at either end: the fallback was UTC", () => {
    const depAt = at("2026-12-10", "06:10", "UTC");
    const out = refileHomeEnds([leg({ depIsHome: true, depAt })], null, BNE);
    expect(out).toEqual([{ id: "t1", depAt: at("2026-12-10", "06:10", BNE) }]);
  });

  it("zone → null (Home base cleared): a Home end falls back to the other end's zone and keeps its time", () => {
    const depAt = at("2026-12-10", "06:10", SYD);
    const out = refileHomeEnds([leg({ depIsHome: true, toTimezone: LIS, depAt })], SYD, null);
    expect(out).toEqual([{ id: "t1", depAt: at("2026-12-10", "06:10", LIS) }]);
  });

  it("a Stop-less far end that borrowed the Home zone moves with it", () => {
    // depIsHome, no toStop: the arrival is shown in the Home zone too (resolveEndpointZones).
    const depAt = at("2026-12-10", "06:10", SYD);
    const arrAt = at("2026-12-10", "08:20", SYD);
    const out = refileHomeEnds([leg({ depIsHome: true, depAt, arrAt })], SYD, BNE);
    expect(out).toEqual([{ id: "t1", depAt: at("2026-12-10", "06:10", BNE), arrAt: at("2026-12-10", "08:20", BNE) }]);
  });

  it("skips untimed ends and legs whose instants don't move", () => {
    const out = refileHomeEnds(
      [
        leg({ id: "untimed", depIsHome: true, toTimezone: LIS }), // depAt/arrAt null (e.g. a date-only import end)
        leg({ id: "winter", depIsHome: true, toTimezone: LIS, depAt: at("2026-07-10", "06:10", SYD) }), // same offset in July
      ],
      SYD,
      BNE,
    );
    expect(out).toEqual([]);
  });

  it("same zone before and after → nothing", () => {
    const out = refileHomeEnds([leg({ depIsHome: true, depAt: at("2026-12-10", "06:10", SYD) })], SYD, SYD);
    expect(out).toEqual([]);
  });
});

describe("refileHomeEndsTx", () => {
  function fakeTx(rows: unknown[]) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const update = vi.fn().mockResolvedValue({});
    return { tx: { transport: { findMany, update } } as unknown as RefileTx, findMany, update };
  }

  it("reads every Plan's Home legs (no forkId filter) with their Stops' zones", async () => {
    const { tx, findMany } = fakeTx([]);
    await refileHomeEndsTx(tx, "trip-1", SYD, BNE);
    expect(findMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1", OR: [{ depIsHome: true }, { arrIsHome: true }] },
      select: {
        id: true, depAt: true, arrAt: true, depIsHome: true, arrIsHome: true,
        fromStop: { select: { timezone: true } },
        toStop: { select: { timezone: true } },
      },
    });
  });

  it("writes only the ends that moved and returns how many legs it rewrote", async () => {
    const { tx, update } = fakeTx([
      { id: "out", depAt: at("2026-12-10", "06:10", SYD), arrAt: at("2026-12-11", "07:15", LIS), depIsHome: true, arrIsHome: false, fromStop: null, toStop: { timezone: LIS } },
      { id: "fork-ret", depAt: null, arrAt: at("2026-12-26", "05:30", SYD), depIsHome: false, arrIsHome: true, fromStop: { timezone: LIS }, toStop: null },
      { id: "winter", depAt: at("2026-07-10", "06:10", SYD), arrAt: null, depIsHome: true, arrIsHome: false, fromStop: null, toStop: { timezone: LIS } },
    ]);
    expect(await refileHomeEndsTx(tx, "trip-1", SYD, BNE)).toBe(2);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith({ where: { id: "out" }, data: { depAt: at("2026-12-10", "06:10", BNE) } });
    expect(update).toHaveBeenCalledWith({ where: { id: "fork-ret" }, data: { arrAt: at("2026-12-26", "05:30", BNE) } });
  });

  it("a Stop whose zone is null (rough) reads as no zone", async () => {
    const { tx, update } = fakeTx([
      { id: "t", depAt: at("2026-12-10", "06:10", "UTC"), arrAt: null, depIsHome: true, arrIsHome: false, fromStop: null, toStop: { timezone: null } },
    ]);
    expect(await refileHomeEndsTx(tx, "trip-1", null, BNE)).toBe(1);
    expect(update).toHaveBeenCalledWith({ where: { id: "t" }, data: { depAt: at("2026-12-10", "06:10", BNE) } });
  });
});
