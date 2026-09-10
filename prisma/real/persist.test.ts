import { describe, it, expect, vi } from "vitest";

// `persist.ts` imports `@/lib/db`, which throws at module-eval time if
// DATABASE_URL isn't set (there's no Postgres in this test environment).
// resolvePaidAt is a pure function and never touches `db`, so an empty
// mock is enough to let the module load — same pattern as lib/globe.test.ts.
vi.mock("@/lib/db", () => ({ db: {} }));

import { resolvePaidAt } from "./persist";

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
