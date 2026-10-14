import { describe, expect, it, vi } from "vitest";
import { mockDb } from "./db-mock";

describe("mockDb", () => {
  it("builds every named delegate with the usual Prisma methods as vi.fn()", async () => {
    const db = mockDb(["trip", "stop"]);
    expect(vi.isMockFunction(db.trip.findUnique)).toBe(true);
    expect(vi.isMockFunction(db.stop.findMany)).toBe(true);
    expect(await db.stop.findMany()).toEqual([]);
    expect(await db.trip.findUnique()).toBeNull();
    expect(await db.stop.count()).toBe(0);
  });
  it("$transaction runs the callback against the same mock", async () => {
    const db = mockDb(["stop"]);
    const seen = await db.$transaction(async (tx: unknown) => tx === db);
    expect(seen).toBe(true);
  });
});
