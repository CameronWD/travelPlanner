import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the whole persistence layer so this test never needs `@/lib/db` or a
// real DATABASE_URL: `seed-real.ts` itself has no top-level import of it (see
// the module docblock), and mocking `./real/persist` keeps that true
// transitively too, since `persistRealTrip` et al. are the only things that
// would otherwise reach `db`.
const {
  ensureRealUserMock,
  assertNoExistingRealTripMock,
  persistRealTripMock,
  addExistingUserAsMemberMock,
} = vi.hoisted(() => ({
  ensureRealUserMock: vi.fn(),
  assertNoExistingRealTripMock: vi.fn(),
  persistRealTripMock: vi.fn(),
  addExistingUserAsMemberMock: vi.fn(),
}));

// `@/lib/db` throws at module-evaluation time when DATABASE_URL is absent —
// which is exactly the situation the failure path has to survive, since that
// missing variable may be the very reason the seed is exiting. A throwing
// getter reproduces it: `const { db } = await import(...)` rejects.
let dbImportAttempts = 0;
vi.mock("../lib/db", () => ({
  get db(): never {
    dbImportAttempts++;
    throw new Error("DATABASE_URL is not set.");
  },
}));

vi.mock("./real/persist", () => ({
  ensureRealUser: ensureRealUserMock,
  assertNoExistingRealTrip: assertNoExistingRealTripMock,
  persistRealTrip: persistRealTripMock,
  addExistingUserAsMember: addExistingUserAsMemberMock,
  REAL_PARTNER_EMAIL: "xanni99.m@hotmail.com",
}));

import { seedReal, unsupportedSeedArgs, disconnectQuietly } from "./seed-real";

// Importing this module under vitest does not fire the `isMain` block:
// `process.argv[1]` is vitest's own entry point here, not this file, so
// `import.meta.url === pathToFileURL(process.argv[1]).href` is false. That's
// what makes it safe to import with no DATABASE_URL set at all.

describe("seedReal dry-run short-circuit", () => {
  beforeEach(() => {
    ensureRealUserMock.mockReset().mockResolvedValue({ id: "user_1", email: "cammark.williams@gmail.com" });
    assertNoExistingRealTripMock.mockReset().mockResolvedValue(undefined);
    persistRealTripMock.mockReset().mockResolvedValue("trip_1");
    addExistingUserAsMemberMock.mockReset().mockResolvedValue(true);
  });

  it("a dry run calls none of the persistence functions", async () => {
    await seedReal({ dryRun: true });
    expect(assertNoExistingRealTripMock).not.toHaveBeenCalled();
    expect(ensureRealUserMock).not.toHaveBeenCalled();
    expect(persistRealTripMock).not.toHaveBeenCalled();
    expect(addExistingUserAsMemberMock).not.toHaveBeenCalled();
  });

  it("a real run calls all four persistence functions, so the branch actually discriminates", async () => {
    await seedReal({});
    expect(assertNoExistingRealTripMock).toHaveBeenCalledTimes(1);
    expect(ensureRealUserMock).toHaveBeenCalledTimes(1);
    expect(persistRealTripMock).toHaveBeenCalledTimes(1);
    expect(addExistingUserAsMemberMock).toHaveBeenCalledTimes(1);
  });

  it("attaches the partner to the trip id persistRealTrip returned, not a stale value", async () => {
    persistRealTripMock.mockResolvedValue("trip_from_persist");
    await seedReal({});
    expect(addExistingUserAsMemberMock).toHaveBeenCalledWith("trip_from_persist", "xanni99.m@hotmail.com");
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

describe("disconnectQuietly", () => {
  beforeEach(() => {
    dbImportAttempts = 0;
  });

  it("skips the database entirely on a dry run", async () => {
    await expect(disconnectQuietly(true)).resolves.toBeUndefined();
    expect(dbImportAttempts).toBe(0);
  });

  // The failure handler runs *after* an error has already been reported, and
  // the seed's own module note explains why `db` can throw on import. If that
  // throw escaped, the handler's promise would reject, the `process.exit(1)`
  // after it would never run, and a failed seed could exit 0.
  it("swallows a db that throws on import, so a failed run still exits cleanly", async () => {
    await expect(disconnectQuietly(false)).resolves.toBeUndefined();
    expect(dbImportAttempts).toBe(1);
  });
});
