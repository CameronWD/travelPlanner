import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the whole persistence layer so this test never needs `@/lib/db` or a
// real DATABASE_URL: `seed-real.ts` itself has no top-level import of it (see
// the module docblock), and mocking `./real/persist` keeps that true
// transitively too, since `persistRealTrip` et al. are the only things that
// would otherwise reach `db`.
const { ensureRealUserMock, assertNoExistingRealTripMock, persistRealTripMock } = vi.hoisted(() => ({
  ensureRealUserMock: vi.fn(),
  assertNoExistingRealTripMock: vi.fn(),
  persistRealTripMock: vi.fn(),
}));

vi.mock("./real/persist", () => ({
  ensureRealUser: ensureRealUserMock,
  assertNoExistingRealTrip: assertNoExistingRealTripMock,
  persistRealTrip: persistRealTripMock,
}));

import { seedReal, unsupportedSeedArgs } from "./seed-real";

// Importing this module under vitest does not fire the `isMain` block:
// `process.argv[1]` is vitest's own entry point here, not this file, so
// `import.meta.url === pathToFileURL(process.argv[1]).href` is false. That's
// what makes it safe to import with no DATABASE_URL set at all.

describe("seedReal dry-run short-circuit", () => {
  beforeEach(() => {
    ensureRealUserMock.mockReset().mockResolvedValue({ id: "user_1", email: "cammark.williams@gmail.com" });
    assertNoExistingRealTripMock.mockReset().mockResolvedValue(undefined);
    persistRealTripMock.mockReset().mockResolvedValue(undefined);
  });

  it("a dry run calls none of the persistence functions", async () => {
    await seedReal({ dryRun: true });
    expect(assertNoExistingRealTripMock).not.toHaveBeenCalled();
    expect(ensureRealUserMock).not.toHaveBeenCalled();
    expect(persistRealTripMock).not.toHaveBeenCalled();
  });

  it("a real run calls all three persistence functions, so the branch actually discriminates", async () => {
    await seedReal({});
    expect(assertNoExistingRealTripMock).toHaveBeenCalledTimes(1);
    expect(ensureRealUserMock).toHaveBeenCalledTimes(1);
    expect(persistRealTripMock).toHaveBeenCalledTimes(1);
  });
});

describe("unsupportedSeedArgs", () => {
  it("accepts --dry-run and no arguments at all", () => {
    expect(unsupportedSeedArgs(["--dry-run"])).toEqual([]);
    expect(unsupportedSeedArgs([])).toEqual([]);
  });

  it("flags a typo instead of silently falling through to a real write", () => {
    expect(unsupportedSeedArgs(["--dryrun"])).toEqual(["--dryrun"]);
    expect(unsupportedSeedArgs(["--dry_run"])).toEqual(["--dry_run"]);
  });

  it("flags any other unrecognised argument, even alongside a valid one", () => {
    expect(unsupportedSeedArgs(["--dry-run", "--wipe"])).toEqual(["--wipe"]);
  });
});
