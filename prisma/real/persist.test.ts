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
const { findManyMock, userFindUniqueMock, userCreateMock, userUpsertMock, tripMemberUpsertMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  userCreateMock: vi.fn(),
  userUpsertMock: vi.fn(),
  tripMemberUpsertMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    trip: { findMany: findManyMock },
    user: { findUnique: userFindUniqueMock, create: userCreateMock, upsert: userUpsertMock },
    tripMember: { upsert: tripMemberUpsertMock },
  },
}));

import { resolvePaidAt, assertNoExistingRealTrip, addExistingUserAsMember, REAL_PARTNER_EMAIL, REAL_USER } from "./persist";

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

describe("real trip participants", () => {
  it("names Cam as the owner and Xanthia as the partner", () => {
    expect(REAL_USER.email).toBe("cammark.williams@gmail.com");
    expect(REAL_PARTNER_EMAIL).toBe("xanni99.m@hotmail.com");
  });

  it("keeps the two participants distinct", () => {
    expect(REAL_PARTNER_EMAIL).not.toBe(REAL_USER.email);
  });
});

describe("addExistingUserAsMember", () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    userCreateMock.mockReset();
    userUpsertMock.mockReset();
    tripMemberUpsertMock.mockReset();
  });

  it("returns false and creates nothing when no user matches the email", async () => {
    userFindUniqueMock.mockResolvedValueOnce(null);

    const result = await addExistingUserAsMember("trip_1", "nobody@example.com");

    expect(result).toBe(false);
    expect(userFindUniqueMock).toHaveBeenCalledWith({
      where: { email: "nobody@example.com" },
      select: { id: true },
    });
    expect(tripMemberUpsertMock).not.toHaveBeenCalled();
    expect(userCreateMock).not.toHaveBeenCalled();
    expect(userUpsertMock).not.toHaveBeenCalled();
  });

  it("returns true and upserts a TripMember with the right tripId/userId/role when a user matches", async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: "user_xanthia" });
    tripMemberUpsertMock.mockResolvedValueOnce({});

    const result = await addExistingUserAsMember("trip_1", "xanni99.m@hotmail.com", "member");

    expect(result).toBe(true);
    expect(tripMemberUpsertMock).toHaveBeenCalledWith({
      where: { tripId_userId: { tripId: "trip_1", userId: "user_xanthia" } },
      update: {},
      create: { tripId: "trip_1", userId: "user_xanthia", role: "member" },
    });
  });

  it("defaults the role to member when none is passed", async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: "user_xanthia" });
    tripMemberUpsertMock.mockResolvedValueOnce({});

    await addExistingUserAsMember("trip_1", "xanni99.m@hotmail.com");

    expect(tripMemberUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ role: "member" }) }),
    );
  });

  it("never creates a User row, even when a member is successfully added", async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: "user_xanthia" });
    tripMemberUpsertMock.mockResolvedValueOnce({});

    await addExistingUserAsMember("trip_1", "xanni99.m@hotmail.com");

    expect(userCreateMock).not.toHaveBeenCalled();
    expect(userUpsertMock).not.toHaveBeenCalled();
  });
});
