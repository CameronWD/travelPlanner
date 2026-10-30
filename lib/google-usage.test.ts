import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type UpsertArgs = {
  where: { day_sku: { day: string; sku: string } };
  create: { day: string; sku: string; count: number };
  update: { count: { increment: number } };
};

const { rows, upsertMock } = vi.hoisted(() => {
  const rows = new Map<string, number>();
  const upsertMock = vi.fn(async (args: UpsertArgs) => {
    const key = `${args.where.day_sku.day}|${args.where.day_sku.sku}`;
    const count = rows.has(key) ? rows.get(key)! + args.update.count.increment : args.create.count;
    rows.set(key, count);
    return { count };
  });
  return { rows, upsertMock };
});
vi.mock("@/lib/db", () => ({ db: { googleUsage: { upsert: upsertMock } } }));

import { takeGoogleQuota } from "./google-usage";

beforeEach(() => {
  rows.clear();
  upsertMock.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("takeGoogleQuota", () => {
  it("takeGoogleQuota allows the 15th call of a UTC day and refuses the 16th; a new day starts again", async () => {
    vi.setSystemTime(new Date("2026-10-30T23:59:00Z"));
    const results: boolean[] = [];
    for (let i = 0; i < 16; i++) results.push(await takeGoogleQuota("venue-details", 15));
    expect(results.slice(0, 15).every(Boolean)).toBe(true);
    expect(results[15]).toBe(false);
    expect(upsertMock).toHaveBeenLastCalledWith({
      where: { day_sku: { day: "2026-10-30", sku: "venue-details" } },
      create: { day: "2026-10-30", sku: "venue-details", count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });

    vi.setSystemTime(new Date("2026-10-31T00:00:01Z"));
    expect(await takeGoogleQuota("venue-details", 15)).toBe(true);
  });

  it("counts each sku separately", async () => {
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    expect(await takeGoogleQuota("a", 1)).toBe(true);
    expect(await takeGoogleQuota("a", 1)).toBe(false);
    expect(await takeGoogleQuota("b", 1)).toBe(true);
  });

  it("refuses rather than throws when the database fails", async () => {
    upsertMock.mockRejectedValueOnce(new Error("db down"));
    expect(await takeGoogleQuota("venue-details", 15)).toBe(false);
  });
});
