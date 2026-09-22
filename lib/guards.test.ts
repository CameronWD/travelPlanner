import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the framework + db dependencies so we can test the requireTripAccess
// wrapper's branching (member allowed vs non-member denied) in isolation.
// vi.hoisted keeps the mock fns available to the hoisted vi.mock factories.
const { authMock, findManyMock, forkFindUniqueMock, notFoundMock, redirectMock, cacheStore } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    findManyMock: vi.fn(),
    forkFindUniqueMock: vi.fn(),
    notFoundMock: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    redirectMock: vi.fn(() => {
      throw new Error("NEXT_REDIRECT");
    }),
    cacheStore: new Map<string, unknown>(),
  }));

const cacheWrapped = vi.hoisted(() => [] as unknown[]);

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  db: {
    tripMember: { findMany: findManyMock },
    fork: { findUnique: forkFindUniqueMock },
  },
}));
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

// React's `cache()` only memoises inside an active RSC render: it looks up a
// dispatcher (`ReactSharedInternals.A`) that Next's request runtime sets up,
// and falls back to calling the function directly when there is none — see
// react-server.development.js. Under Vitest/jsdom, "react" resolves to the
// plain client build, where `cache()` isn't even dispatcher-aware: it's
// `(fn) => (...args) => fn(...args)`, a permanent no-op. That's confirmed by
// running this suite against the real export — it stays red forever, not
// because the wiring is wrong but because this environment can never produce
// the request context real memoisation depends on.
//
// So this stub gives `cache()` real per-argument memoisation (keyed by
// JSON-stringified args, same as production's per-tripId keying) purely so
// this file can verify OUR wiring — one function, dedup by key — without a
// real Next.js request. It is reset in every `afterEach`. That reset is not
// covering up cross-test leakage from the real `cache()` (the real one has
// none to leak here — it does nothing at all in this environment); it is
// standing in for the request boundary that bounds memoisation in production,
// so each test starts as its own "request."
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache:
      <Args extends unknown[], R>(fn: (...args: Args) => R) => {
        const wrapped = (...args: Args): R => {
          const key = JSON.stringify(args);
          if (!cacheStore.has(key)) {
            cacheStore.set(key, fn(...args));
          }
          return cacheStore.get(key) as R;
        };
        // CD-11: recorded so a test can assert requireTripAccess IS this
        // value, not merely that it behaves memoised through this stub.
        cacheWrapped.push(wrapped);
        return wrapped;
      },
  };
});

import {
  assertForkingAllowed,
  isTripOwnerOrAdmin,
  requireAdmin,
  requireForkAccess,
  requireTripAccess,
  requireTripOwner,
  requireUser,
} from "@/lib/guards";

const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

afterEach(() => {
  vi.clearAllMocks();
  cacheStore.clear();
  if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
});

describe("requireTripAccess", () => {
  it("allows a trip member and returns their membership", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);

    const result = await requireTripAccess("trip1");

    expect(result.user.id).toBe("u1");
    expect(result.membership).toEqual({ userId: "u1", role: "owner" });
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("denies a non-member with notFound (no existence leak)", async () => {
    authMock.mockResolvedValue({ user: { id: "stranger" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);

    await expect(requireTripAccess("trip1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it("redirects an unauthenticated user to sign-in", async () => {
    authMock.mockResolvedValue(null);

    await expect(requireTripAccess("trip1")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledOnce();
  });

  // Task 19: Trip Home calls requireTripAccess once for the page and again
  // inside listRemindersForTrip. That's deliberate defence in depth, but it
  // used to cost two identical DB round trips per render. requireTripAccess
  // is now wrapped in React's cache(), which memoises per request — so two
  // calls with the same tripId within one request collapse to one read.
  it("memoises per request: two calls with the same tripId hit the db once", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);

    const first = await requireTripAccess("trip1");
    const second = await requireTripAccess("trip1");

    expect(findManyMock).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
  });

  // The dangerous failure mode for a memoised guard is collapsing distinct
  // keys into one answer — that would be an authorization bypass, not just a
  // caching bug. Pin that cache() keys on tripId: two different trips must
  // each hit the db and must not see each other's membership answer.
  it("keys memoisation by tripId: different trips get independent reads and answers", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockImplementation(async ({ where }: { where: { tripId: string } }) => {
      if (where.tripId === "trip1") return [{ userId: "u1", role: "owner" }];
      return []; // no TripMember row ties u1 to trip2
    });

    const trip1Result = await requireTripAccess("trip1");
    expect(trip1Result.membership).toEqual({ userId: "u1", role: "owner" });

    await expect(requireTripAccess("trip2")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(findManyMock).toHaveBeenCalledTimes(2);
  });
});

describe("requireUser", () => {
  it("returns the session user", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });

    await expect(requireUser()).resolves.toEqual({ id: "u1" });
  });

  it("redirects an unauthenticated user to sign-in", async () => {
    authMock.mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledOnce();
  });

  // Task 8 review (CD-12): requireUser used to re-run auth() on every direct
  // call, even within one request — so a page that called requireUser()
  // itself (TripsPage) and also rendered something that called it a second
  // time (the What's new banner) paid for two session checks per render.
  // requireTripAccess was already cached for the identical reason; this
  // closes the gap for direct callers instead of routing every caller
  // through requireTripAccess.
  it("memoises per request: two direct calls hit auth() once", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });

    const first = await requireUser();
    const second = await requireUser();

    expect(authMock).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
  });
});

describe("guards are structurally cached", () => {
  it("requireUser is literally the value cache() returned, not merely memoised-looking", () => {
    // Every other test in this file exercises memoisation THROUGH the
    // hand-rolled cache() stub, so a bug in the stub would hide a
    // requireUser that is no longer wrapped at all. This is the one
    // assertion that survives that (CD-11).
    expect(
      cacheWrapped.includes(requireUser),
      "requireUser is not a cache() return value — the cache() wrapper was removed from lib/guards.ts",
    ).toBe(true);
  });

  it("requireTripAccess is literally the value cache() returned, not merely memoised-looking", () => {
    expect(
      cacheWrapped.includes(requireTripAccess),
      "requireTripAccess is not a cache() return value — the cache() wrapper was removed from lib/guards.ts",
    ).toBe(true);
  });

  it("wraps exactly the guards this file expects", () => {
    // If a third cache() call appears in lib/guards.ts, it is new behaviour
    // and wants its own test rather than silently joining this one.
    expect(cacheWrapped).toHaveLength(2);
  });
});

describe("assertForkingAllowed", () => {
  it.each(["sketching", "planning", "final-prep"] as const)(
    "allows %s",
    (p) => expect(() => assertForkingAllowed(p)).not.toThrow(),
  );
  it.each(["travelling", "past"] as const)(
    "blocks %s",
    (p) => expect(() => assertForkingAllowed(p)).toThrow(),
  );
});

describe("requireForkAccess", () => {
  const forkRow = {
    id: "fork-1",
    tripId: "trip-1",
    trip: { id: "trip-1", startDate: "2026-09-01", endDate: "2026-09-14" },
  };

  it("returns user, fork, and trip when fork exists and user is a member", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    forkFindUniqueMock.mockResolvedValue(forkRow);
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);

    const result = await requireForkAccess("fork-1");

    expect(result.user.id).toBe("u1");
    expect(result.fork.id).toBe("fork-1");
    expect(result.trip).toEqual({ id: "trip-1", startDate: "2026-09-01", endDate: "2026-09-14" });
    expect(forkFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "fork-1" } }),
    );
  });

  it("calls notFound when the fork does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    forkFindUniqueMock.mockResolvedValue(null);

    await expect(requireForkAccess("missing-fork")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it("calls notFound when the user is not a member of the fork's trip", async () => {
    authMock.mockResolvedValue({ user: { id: "stranger" } });
    forkFindUniqueMock.mockResolvedValue(forkRow);
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);

    await expect(requireForkAccess("fork-1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it("redirects to sign-in when the user is not authenticated", async () => {
    authMock.mockResolvedValue(null);
    forkFindUniqueMock.mockResolvedValue(forkRow);

    await expect(requireForkAccess("fork-1")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledOnce();
  });
});

// ARCH-BND-3: one named owner/admin guard, replacing three hand-rolled
// copies in server/actions/trips.ts and server/actions/invites.ts.
describe("requireTripOwner", () => {
  it("returns for the trip owner", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", email: "owner@example.com" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);

    await expect(requireTripOwner("t1")).resolves.toMatchObject({
      membership: { role: "owner" },
    });
  });

  it("notFound()s for a plain member", async () => {
    authMock.mockResolvedValue({ user: { id: "u2", email: "member@example.com" } });
    findManyMock.mockResolvedValue([{ userId: "u2", role: "member" }]);

    await expect(requireTripOwner("t1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it("returns for an ADMIN_EMAILS operator who is a member but not owner", async () => {
    process.env.ADMIN_EMAILS = "ops@example.com";
    authMock.mockResolvedValue({ user: { id: "u3", email: "ops@example.com" } });
    findManyMock.mockResolvedValue([{ userId: "u3", role: "member" }]);

    await expect(requireTripOwner("t1")).resolves.toBeTruthy();
  });

  it("still notFound()s a non-member, admin or not (no bypass of requireTripAccess)", async () => {
    process.env.ADMIN_EMAILS = "ops@example.com";
    authMock.mockResolvedValue({ user: { id: "stranger", email: "ops@example.com" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);

    await expect(requireTripOwner("t1")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("requireAdmin", () => {
  it("returns the session user for an ADMIN_EMAILS operator", async () => {
    process.env.ADMIN_EMAILS = "ops@example.com";
    authMock.mockResolvedValue({ user: { id: "u1", email: "ops@example.com" } });

    await expect(requireAdmin()).resolves.toEqual({ id: "u1", email: "ops@example.com" });
  });

  it("notFound()s a non-admin", async () => {
    delete process.env.ADMIN_EMAILS;
    authMock.mockResolvedValue({ user: { id: "u2", email: "someone@example.com" } });

    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it("redirects an unauthenticated user to sign-in", async () => {
    authMock.mockResolvedValue(null);

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledOnce();
  });
});

describe("isTripOwnerOrAdmin", () => {
  it("is true for the owner", () => {
    expect(isTripOwnerOrAdmin({ role: "owner" }, "member@example.com")).toBe(true);
  });

  it("is false for a plain member who is not an admin", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isTripOwnerOrAdmin({ role: "member" }, "member@example.com")).toBe(false);
  });

  it("is true for a non-owner member whose email is in ADMIN_EMAILS", () => {
    process.env.ADMIN_EMAILS = "ops@example.com";
    expect(isTripOwnerOrAdmin({ role: "member" }, "ops@example.com")).toBe(true);
  });
});
