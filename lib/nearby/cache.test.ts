import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ upsert: vi.fn(), deleteMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { nearbyCache: { upsert: m.upsert, deleteMany: m.deleteMany, findUnique: vi.fn() } } }));

import { saveNearby } from "./cache";

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
