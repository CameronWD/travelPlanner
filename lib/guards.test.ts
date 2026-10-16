import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the framework + db dependencies so we can test the requireTripAccess
// wrapper's branching (member allowed vs non-member denied) in isolation.
// vi.hoisted keeps the mock fns available to the hoisted vi.mock factories.
const {
  authMock,
  findManyMock,
  forkFindUniqueMock,
  forkFindFirstMock,
  tripFindUniqueMock,
  notFoundMock,
  redirectMock,
  headersGetMock,
  cacheStore,
  stopFindUniqueMock,
  itemFindUniqueMock,
  transportFindUniqueMock,
  accommodationFindUniqueMock,
  costFindUniqueMock,
  chapterFindUniqueMock,
  noteFindUniqueMock,
  reminderFindUniqueMock,
  checklistItemFindUniqueMock,
  requireOutsideSurpriseMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  findManyMock: vi.fn(),
  forkFindUniqueMock: vi.fn(),
  forkFindFirstMock: vi.fn(),
  tripFindUniqueMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  headersGetMock: vi.fn<(name: string) => string | null>(() => null),
  cacheStore: new Map<string, unknown>(),
  stopFindUniqueMock: vi.fn(),
  itemFindUniqueMock: vi.fn(),
  transportFindUniqueMock: vi.fn(),
  accommodationFindUniqueMock: vi.fn(),
  costFindUniqueMock: vi.fn(),
  chapterFindUniqueMock: vi.fn(),
  noteFindUniqueMock: vi.fn(),
  reminderFindUniqueMock: vi.fn(),
  checklistItemFindUniqueMock: vi.fn(),
  requireOutsideSurpriseMock: vi.fn(),
}));

const cacheWrapped = vi.hoisted(() => [] as unknown[]);

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  db: {
    tripMember: { findMany: findManyMock },
    fork: { findUnique: forkFindUniqueMock, findFirst: forkFindFirstMock },
    trip: { findUnique: tripFindUniqueMock },
    stop: { findUnique: stopFindUniqueMock },
    item: { findUnique: itemFindUniqueMock },
    transport: { findUnique: transportFindUniqueMock },
    accommodation: { findUnique: accommodationFindUniqueMock },
    cost: { findUnique: costFindUniqueMock },
    chapter: { findUnique: chapterFindUniqueMock },
    note: { findUnique: noteFindUniqueMock },
    reminder: { findUnique: reminderFindUniqueMock },
    checklistItem: { findUnique: checklistItemFindUniqueMock },
  },
}));
vi.mock("@/lib/surprise-guard", () => ({ requireOutsideSurprise: requireOutsideSurpriseMock }));
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));
vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGetMock }) }));

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

import { runAsTraveller } from "@/lib/mcp/acting-traveller";
import {
  assertForkingAllowed,
  requireAdmin,
  requireForkAccess,
  requirePlanAccess,
  requireRowAccess,
  requireTripAccess,
  requireUser,
} from "@/lib/guards";

// Card C (requireRowAccess) tests address db.<kind>.findUnique directly,
// matching the brief's test shape, rather than threading each delegate mock
// through as its own hoisted name.
const db = {
  stop: { findUnique: stopFindUniqueMock },
  item: { findUnique: itemFindUniqueMock },
  transport: { findUnique: transportFindUniqueMock },
  accommodation: { findUnique: accommodationFindUniqueMock },
  cost: { findUnique: costFindUniqueMock },
  chapter: { findUnique: chapterFindUniqueMock },
  note: { findUnique: noteFindUniqueMock },
  reminder: { findUnique: reminderFindUniqueMock },
  checklistItem: { findUnique: checklistItemFindUniqueMock },
};

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

  // ADR 0067 (Recently deleted): a Trip that's been soft-deleted must be
  // invisible to every member, same as a non-member — notFound(), never a
  // 200 with a tombstoned trip.
  it("denies a member of a Trip in Recently deleted with notFound", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner", trip: { deletedAt: new Date() } }]);
    await expect(requireTripAccess("trip1")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("asks for the Trip's deletedAt alongside membership", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner", trip: { deletedAt: null } }]);
    await requireTripAccess("trip1");
    expect(findManyMock.mock.calls[0][0].select.trip).toEqual({ select: { deletedAt: true } });
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

  it("carries the requested page to the Landing as callbackUrl (spec 2026-10-01 §E)", async () => {
    authMock.mockResolvedValue(null);
    headersGetMock.mockReturnValueOnce("/admin?tab=requests");

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/?callbackUrl=%2Fadmin%3Ftab%3Drequests");
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

  it("requireUser returns the acting traveller inside a Claude connection, without calling auth()", async () => {
    authMock.mockClear();
    const cam = { id: "u1", name: "Cam", email: "c@x.test", image: null };
    const user = await runAsTraveller(cam, () => requireUser());
    expect(user).toEqual(cam);
    expect(authMock).not.toHaveBeenCalled();
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

// Spec 2026-10-14 Q4, ADR 0074 rule 1: the plan-level write guard that
// Task 6 calls from every action accepting a client forkId. A forkId that
// isn't a Fork of this Trip, or a Trip with Forks switched off, is
// notFound() on writes — never a silent fall-back to the real plan.
describe("requirePlanAccess (spec 2026-10-14 Q4)", () => {
  it("real plan: returns plan null without reading forks", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);

    const r = await requirePlanAccess("trip-1", undefined);

    expect(r.plan).toBeNull();
    expect(forkFindFirstMock).not.toHaveBeenCalled();
  });

  it("a Fork of this Trip with Forks enabled: returns its id", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);
    tripFindUniqueMock.mockResolvedValueOnce({ forksEnabled: true });
    forkFindFirstMock.mockResolvedValueOnce({ id: "fork-1" });

    const r = await requirePlanAccess("trip-1", "fork-1");

    expect(r.plan).toBe("fork-1");
    expect(forkFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "fork-1", tripId: "trip-1" } }),
    );
  });

  it("a forkId that is not a Fork of this Trip: notFound, no fall-back", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);
    tripFindUniqueMock.mockResolvedValueOnce({ forksEnabled: true });
    forkFindFirstMock.mockResolvedValueOnce(null);

    await expect(requirePlanAccess("trip-1", "fork-x")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it("Forks switched off: a forkId is notFound", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);
    tripFindUniqueMock.mockResolvedValueOnce({ forksEnabled: false });

    await expect(requirePlanAccess("trip-1", "fork-1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(forkFindFirstMock).not.toHaveBeenCalled();
  });

  it("membership is checked first (non-member never learns a Fork exists)", async () => {
    authMock.mockResolvedValue({ user: { id: "stranger" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);

    await expect(requirePlanAccess("trip-1", "fork-1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(forkFindFirstMock).not.toHaveBeenCalled();
  });
});

it("requireTripOwner is gone", async () => {
  const mod = await import("./guards");
  expect("requireTripOwner" in mod).toBe(false);
});

// Card C (spec 2026-10-14): the one entity guard that replaces fourteen
// private "load row -> notFound -> requireTripAccess -> requireOutsideSurprise"
// copies across the action files. Every kind's row carries tripId, so this
// threads straight into the already-tested requireTripAccess above.
describe("requireRowAccess (card C)", () => {
  it("loads by kind, checks the Trip, checks the Surprise, returns the row", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);
    db.stop.findUnique.mockResolvedValueOnce({ id: "s1", tripId: "trip-1", forkId: null, name: "Lisbon", sortOrder: 0, arriveDate: null, departDate: null, nights: 2, pinned: false, chapterId: null });

    const r = await requireRowAccess("stop", "s1");

    expect(r.row.name).toBe("Lisbon");
    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("u1", { stopId: "s1" });
    expect(db.stop.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s1" } }));
  });

  it("a missing row is notFound before any membership read", async () => {
    db.item.findUnique.mockResolvedValueOnce(null);

    await expect(requireRowAccess("item", "nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("realPlanOnly: a Fork's row reads as notFound", async () => {
    db.cost.findUnique.mockResolvedValueOnce(null); // the where includes forkId: null, so Prisma returns null

    await expect(requireRowAccess("cost", "c1", { realPlanOnly: true })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(db.cost.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1", forkId: null } }));
  });

  it("a cost's Surprise check uses its owner", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);
    db.cost.findUnique.mockResolvedValueOnce({ id: "c1", tripId: "trip-1", forkId: null, currency: "EUR", ownerType: "ITEM", ownerId: "i1" });

    await requireRowAccess("cost", "c1");

    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("u1", { costOwner: { ownerType: "ITEM", ownerId: "i1" } });
  });

  it("a transport has no Surprise variant and skips the check", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);
    db.transport.findUnique.mockResolvedValueOnce({ id: "t1", tripId: "trip-1", forkId: null });

    await requireRowAccess("transport", "t1");

    expect(requireOutsideSurpriseMock).not.toHaveBeenCalled();
  });

  it("the surprised viewer gets the guard's notFound (Review Focus 2)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);
    db.stop.findUnique.mockResolvedValueOnce({ id: "s1", tripId: "trip-1", forkId: null, name: "X", sortOrder: 0, arriveDate: null, departDate: null, nights: null, pinned: false, chapterId: null });
    requireOutsideSurpriseMock.mockRejectedValueOnce(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));

    await expect(requireRowAccess("stop", "s1")).rejects.toThrow(/404/);
  });

  it("a note is checked against its own target", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);
    noteFindUniqueMock.mockResolvedValue({ id: "n1", tripId: "trip-1", targetType: "STOP", targetId: "s1" });

    await requireRowAccess("note", "n1");

    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("u1", {
      target: expect.objectContaining({ targetType: "STOP", targetId: "s1" }),
    });
  });

  it("a reminder is checked against its Stop", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);
    reminderFindUniqueMock.mockResolvedValue({ id: "r1", tripId: "trip-1", stopId: "s1" });

    await requireRowAccess("reminder", "r1");

    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("u1", { stopId: "s1" });
  });

  it("a reminder with no Stop is still checked (stopId null)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);
    reminderFindUniqueMock.mockResolvedValue({ id: "r2", tripId: "trip-1", stopId: null });

    await requireRowAccess("reminder", "r2");

    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("u1", { stopId: null });
  });

  it("a reminder about an Item is checked against the Item (F8)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);
    reminderFindUniqueMock.mockResolvedValue({ id: "r3", tripId: "trip-1", stopId: null, itemId: "i1" });

    await requireRowAccess("reminder", "r3");

    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("u1", { itemId: "i1" });
  });

  it("a surprised viewer is refused a note on the Surprise", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);
    noteFindUniqueMock.mockResolvedValue({ id: "n1", tripId: "trip-1", targetType: "STOP", targetId: "s1" });
    requireOutsideSurpriseMock.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));

    await expect(requireRowAccess("note", "n1")).rejects.toThrow();
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
