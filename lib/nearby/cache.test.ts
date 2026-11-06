import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ upsert: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { nearbyCache: { upsert: m.upsert, deleteMany: m.deleteMany, findUnique: m.findUnique } } }));

import { cachedNearby, saveNearby } from "./cache";

describe("saveNearby", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.upsert.mockResolvedValue({});
    m.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("upserts, then deletes rows older than two days", async () => {
    const before = Date.now();
    await saveNearby("k", "OK", []);
    expect(m.upsert).toHaveBeenCalledTimes(1);
    const cutoff: Date = m.deleteMany.mock.calls[0][0].where.fetchedAt.lt;
    expect(Math.abs(before - cutoff.getTime() - 2 * 86_400_000)).toBeLessThan(5_000);
  });

  it("swallows a failed cleanup", async () => {
    m.deleteMany.mockRejectedValue(new Error("db"));
    await expect(saveNearby("k", "OK", [])).resolves.toBeUndefined();
  });
});

describe("cachedNearby", () => {
  const ago = (ms: number) => new Date(Date.now() - ms);

  it("is a miss when there is no row", async () => {
    m.findUnique.mockResolvedValue(null);
    expect(await cachedNearby("k")).toBeNull();
  });

  it("serves an OK row however old", async () => {
    m.findUnique.mockResolvedValue({ status: "OK", results: [], fetchedAt: ago(20 * 3_600_000) });
    expect(await cachedNearby("k")).toEqual({ status: "OK", results: [] });
  });

  it("serves a recent ERROR row", async () => {
    m.findUnique.mockResolvedValue({ status: "ERROR", results: [], fetchedAt: ago(5 * 60_000) });
    expect(await cachedNearby("k")).toEqual({ status: "ERROR", results: [] });
  });

  it("treats an ERROR row older than 15 minutes as a miss", async () => {
    m.findUnique.mockResolvedValue({ status: "ERROR", results: [], fetchedAt: ago(16 * 60_000) });
    expect(await cachedNearby("k")).toBeNull();
  });
});
