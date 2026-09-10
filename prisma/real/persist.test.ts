import { describe, it, expect, vi, beforeEach } from "vitest";

// `persist.ts` no longer imports `@/lib/db` at the top level — it loads `db`
// lazily via a dynamic `import()` inside each function that needs it
// (loadDb()), specifically so this module can be imported, and a dry run can
// execute, with no DATABASE_URL set (there's no Postgres in this test
// environment, and the only DATABASE_URL this repo ever supplies points at
// production). Vitest's `vi.mock` intercepts a dynamic `import()` the same
// way it intercepts a static one, so mocking `@/lib/db` here still works —
// and it's what lets the assertNoExistingRealTrip tests below control
// `trip.findMany`'s return value without a real database.
const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { trip: { findMany: findManyMock } } }));

import { resolvePaidAt, assertNoExistingRealTrip } from "./persist";

const FALLBACK = new Date("2026-09-10T00:00:00.000Z");

describe("resolvePaidAt", () => {
  it("returns null for an unpaid cost", () => {
    expect(resolvePaidAt({ paid: false }, FALLBACK)).toBeNull();
  });

  it("returns null for a missing cost", () => {
    expect(resolvePaidAt(undefined, FALLBACK)).toBeNull();
    expect(resolvePaidAt(null, FALLBACK)).toBeNull();
  });

  it("uses the recorded payment date when the cost has one", () => {
    const got = resolvePaidAt({ paid: true, paidAt: "2026-07-13" }, FALLBACK);
    expect(got).toEqual(new Date("2026-07-13"));
  });

  it("falls back when a paid cost has no recorded date", () => {
    expect(resolvePaidAt({ paid: true }, FALLBACK)).toEqual(FALLBACK);
    expect(resolvePaidAt({ paid: true, paidAt: null }, FALLBACK)).toEqual(FALLBACK);
  });
});

describe("assertNoExistingRealTrip", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("resolves quietly when no trip of that name exists", async () => {
    findManyMock.mockResolvedValueOnce([]);
    await expect(assertNoExistingRealTrip("Christmas in Europe 2026")).resolves.toBeUndefined();
  });

  it("throws, naming every offending id, when a trip already exists", async () => {
    findManyMock.mockResolvedValueOnce([{ id: "trip_abc" }, { id: "trip_def" }]);
    const promise = assertNoExistingRealTrip("Christmas in Europe 2026");
    await expect(promise).rejects.toThrow(/Refusing to write: 2 trip\(s\) already named "Christmas in Europe 2026"/);
    await expect(promise).rejects.toThrow(/trip_abc/);
    await expect(promise).rejects.toThrow(/trip_def/);
  });

  it("defaults to REAL_TRIP_NAME when no name is passed", async () => {
    findManyMock.mockResolvedValueOnce([]);
    await assertNoExistingRealTrip();
    expect(findManyMock).toHaveBeenCalledWith({
      where: { name: "Christmas in Europe 2026" },
      select: { id: true },
    });
  });
});
