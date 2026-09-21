import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the Digest dispatcher (lib/digest-dispatch.ts).
 *
 * `@/lib/db` is replaced with a tiny in-memory fake: each `findMany` actually
 * evaluates the `where` clause it is handed against seeded rows. That matters —
 * the filters ARE the behaviour here (unpaid only, `forkId: null` only, the
 * three-day window), so a test that merely asserted "findMany was called" would
 * keep passing after someone dropped `paidAt: null` from the query.
 *
 * `@/lib/push` is only partially mocked: `sendPush` is a spy, but the real
 * `buildDigestPayload` runs so the payload the device would receive is
 * asserted end to end.
 */

const {
  dbData,
  resetDb,
  tripFindUniqueMock,
  costFindManyMock,
  checklistItemFindManyMock,
  reminderFindManyMock,
  transportFindManyMock,
  accommodationFindManyMock,
  itemFindManyMock,
  stopFindManyMock,
  digestPreferenceFindUniqueMock,
  digestDispatchCreateMock,
  digestDispatchDeleteMock,
  digestDispatchFindFirstMock,
  pushSubscriptionFindManyMock,
  pushSubscriptionDeleteManyMock,
  sendPushMock,
  buildDigestMock,
} = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  const dbData: Record<string, Row[]> = {
    trip: [],
    cost: [],
    checklistItem: [],
    reminder: [],
    transport: [],
    accommodation: [],
    item: [],
    stop: [],
    pushSubscription: [],
  };

  /** Minimal Prisma `where` evaluator: equality, null, in/gte/lte/not, OR/AND. */
  function matchesWhere(row: Row, where: unknown): boolean {
    if (!where || typeof where !== "object") return true;
    return Object.entries(where as Record<string, unknown>).every(([key, cond]) => {
      if (key === "OR") return (cond as unknown[]).some((w) => matchesWhere(row, w));
      if (key === "AND") return (cond as unknown[]).every((w) => matchesWhere(row, w));
      const value = row[key] as never;
      if (cond === null) return value === null || value === undefined;
      if (typeof cond === "object" && !(cond instanceof Date)) {
        const c = cond as Record<string, unknown>;
        if ("in" in c && !(c.in as unknown[]).includes(value)) return false;
        if ("gte" in c && !(value >= (c.gte as never))) return false;
        if ("lte" in c && !(value <= (c.lte as never))) return false;
        if ("not" in c) {
          if (c.not === null) {
            if (value === null || value === undefined) return false;
          } else if (value === c.not) return false;
        }
        return true;
      }
      return value === cond;
    });
  }

  function findMany(table: string) {
    return vi.fn(async (args?: { where?: unknown }) =>
      dbData[table].filter((row) => matchesWhere(row, args?.where)),
    );
  }

  function resetDb() {
    for (const key of Object.keys(dbData)) dbData[key] = [];
  }

  return {
    dbData,
    resetDb,
    tripFindUniqueMock: vi.fn(async (args: { where: { id: string } }) =>
      dbData.trip.find((t) => t.id === args.where.id) ?? null,
    ),
    costFindManyMock: findMany("cost"),
    checklistItemFindManyMock: findMany("checklistItem"),
    reminderFindManyMock: findMany("reminder"),
    transportFindManyMock: findMany("transport"),
    accommodationFindManyMock: findMany("accommodation"),
    itemFindManyMock: findMany("item"),
    stopFindManyMock: findMany("stop"),
    digestPreferenceFindUniqueMock: vi.fn(),
    digestDispatchCreateMock: vi.fn(),
    digestDispatchDeleteMock: vi.fn(),
    digestDispatchFindFirstMock: vi.fn(),
    pushSubscriptionFindManyMock: findMany("pushSubscription"),
    pushSubscriptionDeleteManyMock: vi.fn(),
    sendPushMock: vi.fn(),
    buildDigestMock: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: tripFindUniqueMock },
    cost: { findMany: costFindManyMock },
    checklistItem: { findMany: checklistItemFindManyMock },
    reminder: { findMany: reminderFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    item: { findMany: itemFindManyMock },
    stop: { findMany: stopFindManyMock },
    digestPreference: { findUnique: digestPreferenceFindUniqueMock },
    digestDispatch: {
      create: digestDispatchCreateMock,
      delete: digestDispatchDeleteMock,
      findFirst: digestDispatchFindFirstMock,
    },
    pushSubscription: {
      findMany: pushSubscriptionFindManyMock,
      deleteMany: pushSubscriptionDeleteManyMock,
    },
  },
}));

vi.mock("@/lib/push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/push")>()),
  sendPush: sendPushMock,
}));

// The pure builder runs for real — the spy exists only so one test can make it
// throw. `vi.clearAllMocks()` clears calls, not implementations, so the
// passthrough set here survives every `beforeEach`.
vi.mock("@/lib/digest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/digest")>();
  buildDigestMock.mockImplementation(actual.buildDigest);
  return { ...actual, buildDigest: buildDigestMock };
});

// Import after the mocks.
import {
  DIGEST_LOOKAHEAD_DAYS,
  collectDigestInput,
  dispatchDigest,
} from "@/lib/digest-dispatch";

const USER_ID = "user-1";
const TRIP_ID = "trip-1";
const LOCAL_DATE = "2026-12-01";
/** The day an EVENING digest looks ahead to. */
const TOMORROW = "2026-12-02";

/** Trip that is still being planned on LOCAL_DATE (departs 2026-12-20). */
function seedPlanningTrip() {
  dbData.trip = [
    { id: TRIP_ID, startDate: "2026-12-20", endDate: "2026-12-30", homeName: "Sydney" },
  ];
}

/** Trip that is under way on LOCAL_DATE. */
function seedTravellingTrip() {
  dbData.trip = [
    { id: TRIP_ID, startDate: "2026-11-25", endDate: "2026-12-10", homeName: "Sydney" },
  ];
}

function seedSubscription(id: string, userId = USER_ID) {
  dbData.pushSubscription.push({
    id,
    userId,
    endpoint: `https://push.example/${id}`,
    p256dh: `p256dh-${id}`,
    auth: `auth-${id}`,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  seedPlanningTrip();
  // The simplest non-empty EVENING digest: one Reminder dated TOMORROW, which
  // is when an evening Digest reads reminders out (CONTEXT.md **Reminder**).
  dbData.reminder = [{ id: "rem-1", tripId: TRIP_ID, title: "Print insurance docs", date: TOMORROW }];
  seedSubscription("sub-1");
  digestPreferenceFindUniqueMock.mockResolvedValue(null);
  digestDispatchCreateMock.mockResolvedValue({ id: "dd-1" });
  digestDispatchDeleteMock.mockResolvedValue({});
  digestDispatchFindFirstMock.mockResolvedValue(null);
  pushSubscriptionDeleteManyMock.mockResolvedValue({ count: 0 });
  sendPushMock.mockResolvedValue({ sent: true });
});

function dispatch(over: Partial<Parameters<typeof dispatchDigest>[0]> = {}) {
  return dispatchDigest({
    userId: USER_ID,
    tripId: TRIP_ID,
    localDate: LOCAL_DATE,
    slot: "EVENING",
    ...over,
  });
}

// ---------------------------------------------------------------------------
// dispatchDigest
// ---------------------------------------------------------------------------

describe("dispatchDigest", () => {
  it("claims the ledger before sending", async () => {
    const result = await dispatch();

    expect(digestDispatchCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: USER_ID, tripId: TRIP_ID, localDate: LOCAL_DATE, slot: "EVENING" },
      }),
    );
    expect(sendPushMock).toHaveBeenCalledTimes(1);
    // Claim-before-send is the whole idempotency design: if the push happened
    // first, two overlapping cron runs could both send before either claimed.
    expect(digestDispatchCreateMock.mock.invocationCallOrder[0]).toBeLessThan(
      sendPushMock.mock.invocationCallOrder[0],
    );
    // And the claim STAYS claimed: releasing it after a successful send would
    // re-open the slot for the next cron run to send all over again.
    expect(digestDispatchDeleteMock).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 1, skipped: false });
  });

  it("skips when the ledger row already exists", async () => {
    digestDispatchCreateMock.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    const result = await dispatch();

    expect(result).toEqual({ sent: 0, skipped: true, reason: "already-sent" });
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("skips a second dispatch for the same slot inside the cooldown", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue(null);
    digestDispatchFindFirstMock.mockResolvedValue({ id: "d1" });

    const result = await dispatchDigest({
      userId: "u1",
      tripId: "t1",
      localDate: "2026-09-22",
      slot: "EVENING",
      zone: "Australia/Sydney",
    });

    expect(result).toEqual({ sent: 0, skipped: true, reason: "already-sent" });
    expect(digestDispatchCreateMock).not.toHaveBeenCalled();
  });

  it("claims when no recent dispatch exists", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue(null);
    digestDispatchFindFirstMock.mockResolvedValue(null);
    digestDispatchCreateMock.mockResolvedValue({ id: "d2" });

    await dispatchDigest({
      userId: "u1",
      tripId: "t1",
      localDate: "2026-09-22",
      slot: "EVENING",
    });

    expect(digestDispatchCreateMock).toHaveBeenCalled();
  });

  it("does not apply the cooldown to a forced test send", async () => {
    digestDispatchFindFirstMock.mockResolvedValue({ id: "d1" });

    await dispatchDigest({
      userId: "u1",
      tripId: "t1",
      localDate: "2026-09-22",
      slot: "EVENING",
      force: true,
    });

    expect(digestDispatchFindFirstMock).not.toHaveBeenCalled();
  });

  it("rethrows a create failure that is not a unique violation", async () => {
    digestDispatchCreateMock.mockRejectedValue(
      Object.assign(new Error("connection lost"), { code: "P1001" }),
    );

    // Swallowing this would turn a database outage into a silent "already sent".
    await expect(dispatch()).rejects.toThrow("connection lost");
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("skips when the preference row says disabled", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue({ enabled: false });

    const result = await dispatch();

    expect(result).toEqual({ sent: 0, skipped: true, reason: "disabled" });
    expect(digestDispatchCreateMock).not.toHaveBeenCalled();
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("treats a missing preference row as enabled", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue(null);

    const result = await dispatch();

    // Subscribing a device is itself the opt-in — a missing row must never
    // silently mute someone.
    expect(digestPreferenceFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_tripId: { userId: USER_ID, tripId: TRIP_ID } } }),
    );
    expect(result).toEqual({ sent: 1, skipped: false });
    expect(sendPushMock).toHaveBeenCalledTimes(1);
  });

  it("releases the claim when the digest is empty", async () => {
    dbData.reminder = []; // nothing true today → buildDigest returns null

    const result = await dispatch();

    expect(result).toEqual({ sent: 0, skipped: true, reason: "empty" });
    expect(sendPushMock).not.toHaveBeenCalled();
    // Without the release, a quiet morning burns the slot and a plan edit
    // later the same day could never produce a digest.
    expect(digestDispatchDeleteMock).toHaveBeenCalledWith({
      where: {
        userId_tripId_localDate_slot: {
          userId: USER_ID,
          tripId: TRIP_ID,
          localDate: LOCAL_DATE,
          slot: "EVENING",
        },
      },
    });
  });

  it("does not retry a release delete that already failed", async () => {
    dbData.reminder = []; // nothing true today → buildDigest returns null → empty path
    const deleteError = new Error("delete failed");
    digestDispatchDeleteMock.mockRejectedValueOnce(deleteError);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await dispatch();

    // A delete that already failed cannot be un-failed by trying it again on
    // the very same row. Before the fix, `claimed` was still `true` when this
    // propagated to the outer catch, so the outer catch's own `releaseClaim()`
    // fired a second delete on the same row — failing twice, with the second
    // failure hiding the first, and rejecting `dispatchDigest` entirely
    // instead of reporting the ordinary empty-day result.
    expect(digestDispatchDeleteMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: 0, skipped: true, reason: "empty" });
    // A slot that failed to release stays claimed until tomorrow, and nothing
    // else in the system will ever say so — this must be visible somewhere.
    // `slot` is what tells a morning failure from an evening one in the
    // logs; without it here, dropping it from the real payload fails
    // nothing (CD-10).
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("release"),
      expect.objectContaining({
        userId: USER_ID,
        tripId: TRIP_ID,
        localDate: LOCAL_DATE,
        slot: "EVENING",
      }),
      deleteError,
    );

    errorSpy.mockRestore();
  });

  it("releases the claim when collecting the digest throws", async () => {
    costFindManyMock.mockRejectedValueOnce(new Error("db went away"));

    // A claim must not outlive the work it claimed: holding the slot would mute
    // this person for the rest of the day and make every retry say "already-sent".
    await expect(dispatch()).rejects.toThrow("db went away");

    expect(digestDispatchDeleteMock).toHaveBeenCalledWith({
      where: {
        userId_tripId_localDate_slot: {
          userId: USER_ID,
          tripId: TRIP_ID,
          localDate: LOCAL_DATE,
          slot: "EVENING",
        },
      },
    });
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("surfaces the original error when the claim release ALSO fails", async () => {
    // Covered separately today: a mid-flight throw releasing the claim, and a
    // release delete failing. Never both. Together is the bad case — the
    // release failure must be logged, and must not replace or bury the error
    // the caller actually needs to see and count (CD-10).
    const collectError = new Error("db went away");
    const deleteError = new Error("delete failed");
    costFindManyMock.mockRejectedValueOnce(collectError);
    digestDispatchDeleteMock.mockRejectedValueOnce(deleteError);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(dispatch()).rejects.toThrow("db went away");

    // Released exactly once — the failed delete is not retried on the same row.
    expect(digestDispatchDeleteMock).toHaveBeenCalledTimes(1);
    // And the stranded claim is visible to an operator.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("release"),
      expect.objectContaining({
        userId: USER_ID,
        tripId: TRIP_ID,
        localDate: LOCAL_DATE,
        slot: "EVENING",
      }),
      deleteError,
    );
    expect(sendPushMock).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("releases the claim when building the digest throws", async () => {
    buildDigestMock.mockImplementationOnce(() => {
      throw new Error("malformed digest input");
    });

    await expect(dispatch()).rejects.toThrow("malformed digest input");

    expect(digestDispatchDeleteMock).toHaveBeenCalledTimes(1);
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("releases the claim when the subscription lookup throws", async () => {
    pushSubscriptionFindManyMock.mockRejectedValueOnce(new Error("connection reset"));

    await expect(dispatch()).rejects.toThrow("connection reset");

    expect(digestDispatchDeleteMock).toHaveBeenCalledTimes(1);
  });

  it("does not release a claim it never made when a forced send throws", async () => {
    buildDigestMock.mockImplementationOnce(() => {
      throw new Error("malformed digest input");
    });

    await expect(dispatch({ force: true })).rejects.toThrow("malformed digest input");

    // force never wrote a ledger row, so it must never delete one either.
    expect(digestDispatchDeleteMock).not.toHaveBeenCalled();
  });

  it("sends the placeholder instead of refusing when a forced digest is empty", async () => {
    dbData.reminder = [];

    const result = await dispatch({ force: true });

    // The button's job is proving the pipe works, so an empty day must still
    // put something on the device — flagged as a placeholder, never as content.
    expect(result).toEqual({ sent: 1, skipped: false, placeholder: true });
    expect(digestDispatchDeleteMock).not.toHaveBeenCalled();
  });

  it("puts the placeholder wording on the wire when a forced digest is empty", async () => {
    dbData.reminder = [];

    await dispatch({ force: true });

    const payload = JSON.parse(sendPushMock.mock.calls[0][1] as string);
    expect(payload.title).toBe("Test · TEEPEE");
    expect(payload.body).toBe(
      "Push is working. Your digest arrives in the evening when there's something to say.",
    );
  });

  it("marks a forced send that does have content as a test", async () => {
    const result = await dispatch({ force: true });

    // Real content goes out verbatim — but titled so it cannot be mistaken
    // for the scheduled 8pm digest a few hours later.
    expect(result).toEqual({ sent: 1, skipped: false });
    const payload = JSON.parse(sendPushMock.mock.calls[0][1] as string);
    expect(payload.title).toMatch(/^Test · /);
  });

  it("leaves a scheduled empty digest silent and releases the slot", async () => {
    dbData.reminder = [];

    const result = await dispatch();

    // Unforced, nothing changes: a quiet evening still sends nothing at all.
    expect(result).toEqual({ sent: 0, skipped: true, reason: "empty" });
    expect(sendPushMock).not.toHaveBeenCalled();
    // Without the release, a quiet morning burns the slot and a plan edit
    // later the same day could never produce a digest.
    expect(digestDispatchDeleteMock).toHaveBeenCalledWith({
      where: {
        userId_tripId_localDate_slot: {
          userId: USER_ID,
          tripId: TRIP_ID,
          localDate: LOCAL_DATE,
          slot: "EVENING",
        },
      },
    });
  });

  it("force bypasses both the preference and the ledger", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue({ enabled: false });

    const result = await dispatch({ force: true });

    expect(result).toEqual({ sent: 1, skipped: false });
    expect(digestDispatchCreateMock).not.toHaveBeenCalled();
    expect(sendPushMock).toHaveBeenCalledTimes(1);
  });

  it("prunes a subscription the push service reports gone", async () => {
    seedSubscription("sub-2");
    sendPushMock.mockImplementation(async (sub: { endpoint: string }) =>
      sub.endpoint.endsWith("sub-2") ? { sent: false, gone: true } : { sent: true },
    );

    const result = await dispatch();

    expect(result).toEqual({ sent: 1, skipped: false });
    expect(pushSubscriptionDeleteManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["sub-2"] } },
    });
  });

  it("does not prune a subscription that merely failed to send", async () => {
    sendPushMock.mockResolvedValue({ sent: false });

    const result = await dispatch();

    expect(result).toEqual({ sent: 0, skipped: false });
    expect(pushSubscriptionDeleteManyMock).not.toHaveBeenCalled();
  });

  it("releases the claim when a device existed but nothing was delivered", async () => {
    // sendPush swallows every non-404/410 error and returns { sent: false }
    // without throwing, so a gateway 500 exits this loop *normally*. Leaving
    // the ledger row standing means the redundancy run inside the same window
    // answers "already-sent" and the day's Digest is lost with failed: 0 in the
    // cron response and nothing in the logs. Sending twice on a lost response
    // is strictly better than never sending.
    sendPushMock.mockResolvedValue({ sent: false });

    const result = await dispatch();

    expect(result).toEqual({ sent: 0, skipped: false });
    expect(digestDispatchDeleteMock).toHaveBeenCalledWith({
      where: {
        userId_tripId_localDate_slot: {
          userId: USER_ID,
          tripId: TRIP_ID,
          localDate: LOCAL_DATE,
          slot: "EVENING",
        },
      },
    });
  });

  it("does not retry a release delete that already failed on the zero-delivery path", async () => {
    // The empty-digest release site isn't the only one that calls
    // `releaseClaim` from inside the outer try — this one (sendPush delivered
    // to no device) does too, and shares the same fix.
    sendPushMock.mockResolvedValue({ sent: false });
    const deleteError = new Error("delete failed");
    digestDispatchDeleteMock.mockRejectedValueOnce(deleteError);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await dispatch();

    expect(digestDispatchDeleteMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: 0, skipped: false });
    // `slot` is what tells a morning failure from an evening one in the
    // logs; without it here, dropping it from the real payload fails
    // nothing (CD-10).
    //
    // NOTE (brief correction): the task-11 brief said to also pin
    // `subscriptions: 1` here. That field is only ever logged on the
    // "no push was delivered" 2-arg console.error (digest-dispatch.ts:687),
    // which this 3-arg toHaveBeenCalledWith can never match against — the
    // call this assertion actually pins is the shared release-failure log
    // in `releaseClaim`'s catch (digest-dispatch.ts:627-630), which only
    // ever logs { userId, tripId, localDate, slot }. Adding `subscriptions`
    // here made the test fail for the wrong reason (confirmed by running
    // it); verified against source before writing this.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("release"),
      expect.objectContaining({
        userId: USER_ID,
        tripId: TRIP_ID,
        localDate: LOCAL_DATE,
        slot: "EVENING",
      }),
      deleteError,
    );
    // The zero-delivery path also logs separately, BEFORE attempting the
    // release, that nothing was delivered — a distinct 2-arg call at
    // digest-dispatch.ts:683-687 that carries `slot` and `subscriptions`
    // but never an `err`. Pin it here too, or deleting `slot` from that
    // site specifically passes both tests in this file untouched.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("no push was delivered"),
      expect.objectContaining({
        userId: USER_ID,
        tripId: TRIP_ID,
        localDate: LOCAL_DATE,
        slot: "EVENING",
        subscriptions: 1,
      }),
    );

    errorSpy.mockRestore();
  });

  it("keeps the claim when at least one device took the push", async () => {
    seedSubscription("sub-2");
    sendPushMock.mockImplementation(async (sub: { endpoint: string }) =>
      sub.endpoint.endsWith("sub-2") ? { sent: false } : { sent: true },
    );

    const result = await dispatch();

    // Releasing here would re-open the slot and send the whole digest again to
    // the device that already got it.
    expect(result).toEqual({ sent: 1, skipped: false });
    expect(digestDispatchDeleteMock).not.toHaveBeenCalled();
  });

  it("does not release a slot it never claimed when a forced test send fails", async () => {
    sendPushMock.mockResolvedValue({ sent: false });

    const result = await dispatch({ force: true });

    expect(result).toEqual({ sent: 0, skipped: false });
    expect(digestDispatchDeleteMock).not.toHaveBeenCalled();
  });

  it("does not touch the ledger when the user owns no device at all", async () => {
    dbData.pushSubscription = [];

    const result = await dispatch();

    // Nothing failed — there was nowhere to send. The slot stays claimed, and
    // a device subscribed later today does not get a backdated digest.
    expect(result).toEqual({ sent: 0, skipped: false });
    expect(digestDispatchDeleteMock).not.toHaveBeenCalled();
  });

  it("sends to every subscription the user owns", async () => {
    seedSubscription("sub-2");

    const result = await dispatch();

    expect(sendPushMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 2, skipped: false });
  });

  it("sends to nobody else's devices", async () => {
    seedSubscription("sub-other", "user-2");

    await dispatch();

    expect(sendPushMock).toHaveBeenCalledTimes(1);
    expect(sendPushMock).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example/sub-1" }),
      expect.any(String),
    );
  });

  it("pushes the built digest as the payload", async () => {
    await dispatch();

    const payload = JSON.parse(sendPushMock.mock.calls[0][1] as string);
    expect(payload).toEqual({
      title: "Coming up",
      body: "Print insurance docs",
      url: `/trips/${TRIP_ID}`,
    });
  });
});

// ---------------------------------------------------------------------------
// collectDigestInput
// ---------------------------------------------------------------------------

function collect(over: Partial<Parameters<typeof collectDigestInput>[0]> = {}) {
  return collectDigestInput({
    tripId: TRIP_ID,
    localDate: LOCAL_DATE,
    slot: "EVENING",
    ...over,
  });
}

describe("collectDigestInput", () => {
  it("exposes a three-day lookahead", () => {
    expect(DIGEST_LOOKAHEAD_DAYS).toBe(3);
  });

  it("collects only unpaid, non-fork costs inside the lookahead window", async () => {
    dbData.accommodation = [
      { id: "acc-1", tripId: TRIP_ID, forkId: null, name: "Airbnb Vienna" },
    ];
    dbData.cost = [
      {
        id: "cost-in-window",
        tripId: TRIP_ID,
        forkId: null,
        paidAt: null,
        dueDate: "2026-12-04", // localDate + 3 — the last day in the window
        costMinor: 24000,
        currency: "GBP",
        label: null,
        ownerType: "ACCOMMODATION",
        ownerId: "acc-1",
      },
      {
        id: "cost-paid-today",
        tripId: TRIP_ID,
        forkId: null,
        paidAt: new Date("2026-11-30T00:00:00Z"),
        dueDate: LOCAL_DATE,
        costMinor: 5000,
        currency: "GBP",
        label: null,
        ownerType: "ACCOMMODATION",
        ownerId: "acc-1",
      },
      {
        id: "cost-on-a-fork",
        tripId: TRIP_ID,
        forkId: "fork-1",
        paidAt: null,
        dueDate: LOCAL_DATE,
        costMinor: 9900,
        currency: "GBP",
        label: null,
        ownerType: "ACCOMMODATION",
        ownerId: "acc-1",
      },
      {
        id: "cost-past-the-window",
        tripId: TRIP_ID,
        forkId: null,
        paidAt: null,
        dueDate: "2026-12-05", // localDate + 4
        costMinor: 1000,
        currency: "GBP",
        label: null,
        ownerType: "ACCOMMODATION",
        ownerId: "acc-1",
      },
      {
        id: "cost-already-gone",
        tripId: TRIP_ID,
        forkId: null,
        paidAt: null,
        dueDate: "2026-11-30", // yesterday
        costMinor: 1000,
        currency: "GBP",
        label: null,
        ownerType: "ACCOMMODATION",
        ownerId: "acc-1",
      },
      {
        id: "cost-other-trip",
        tripId: "trip-2",
        forkId: null,
        paidAt: null,
        dueDate: LOCAL_DATE,
        costMinor: 1000,
        currency: "GBP",
        label: null,
        ownerType: "ACCOMMODATION",
        ownerId: "acc-1",
      },
    ];

    const input = await collect();

    expect(input.payments).toHaveLength(1);
    expect(input.payments[0]).toMatchObject({
      id: "cost-in-window",
      label: "Airbnb Vienna",
      daysUntil: 3,
    });
    // formatMoney's en-AU default renders a foreign currency by code, and
    // separates it with a non-breaking space.
    expect(input.payments[0].amountLabel.replace(/ /g, " ")).toBe("GBP 240.00");
  });

  it("labels a stop-linked transport cost through the trip's stop names", async () => {
    dbData.stop = [
      { id: "stop-1", tripId: TRIP_ID, forkId: null, name: "Vienna", timezone: "Europe/Vienna" },
      { id: "stop-2", tripId: TRIP_ID, forkId: null, name: "Prague", timezone: "Europe/Prague" },
    ];
    dbData.transport = [
      {
        id: "tr-1",
        tripId: TRIP_ID,
        forkId: null,
        mode: "TRAIN",
        fromStopId: "stop-1",
        toStopId: "stop-2",
        depPlace: null,
        arrPlace: null,
        depAt: null,
        reference: null,
        depIsHome: false,
        arrIsHome: false,
      },
    ];
    dbData.cost = [
      {
        id: "cost-1",
        tripId: TRIP_ID,
        forkId: null,
        paidAt: null,
        dueDate: LOCAL_DATE,
        costMinor: 8900,
        currency: "EUR",
        label: null,
        ownerType: "TRANSPORT",
        ownerId: "tr-1",
      },
    ];

    const input = await collect();

    // A digest line reading "Cost · €89" instead of "Train · Vienna → Prague"
    // is the failure this guards.
    expect(input.payments[0].label).toBe("Train · Vienna → Prague");
    expect(input.payments[0].daysUntil).toBe(0);
  });

  it("names an OTHER cost by its own free text", async () => {
    dbData.cost = [
      {
        id: "cost-1",
        tripId: TRIP_ID,
        forkId: null,
        paidAt: null,
        dueDate: LOCAL_DATE,
        costMinor: 12000,
        currency: "AUD",
        label: "Travel insurance",
        ownerType: "OTHER",
        ownerId: null,
      },
    ];

    const input = await collect();

    expect(input.payments[0].label).toBe("Travel insurance");
  });

  it("collects undone checklist items up to the window end, overdue ones included", async () => {
    dbData.checklistItem = [
      { id: "chk-1", tripId: TRIP_ID, done: false, dueDate: TOMORROW, text: "Apply for the visa" },
      { id: "chk-done", tripId: TRIP_ID, done: true, dueDate: LOCAL_DATE, text: "Buy an eSIM" },
      { id: "chk-late", tripId: TRIP_ID, done: false, dueDate: "2026-12-05", text: "Pack" },
      { id: "chk-undated", tripId: TRIP_ID, done: false, dueDate: null, text: "Someday" },
    ];

    const input = await collect();

    expect(input.checklist).toEqual([
      { id: "chk-1", text: "Apply for the visa", daysUntil: 1 },
    ]);
  });

  it("keeps an overdue checklist item in the digest until it is done", async () => {
    // A Checklist item "persists until done" and keeps reappearing while
    // overdue (CONTEXT.md **Checklist**) — that property is the whole
    // distinction from a Reminder. A lower bound on dueDate would give it a
    // Reminder's lifecycle: miss the day, lose the item, silently.
    dbData.checklistItem = [
      { id: "chk-overdue", tripId: TRIP_ID, done: false, dueDate: "2026-11-28", text: "Apply for the visa" },
      { id: "chk-overdue-done", tripId: TRIP_ID, done: true, dueDate: "2026-11-28", text: "Buy an eSIM" },
    ];

    const input = await collect();

    expect(input.checklist).toEqual([
      { id: "chk-overdue", text: "Apply for the visa", daysUntil: -3 },
    ]);
  });

  it("reads out tomorrow's reminders in the evening slot", async () => {
    dbData.reminder = [
      { id: "rem-today", tripId: TRIP_ID, title: "Old news", date: LOCAL_DATE },
      { id: "rem-tomorrow", tripId: TRIP_ID, title: "Ring the landlord", date: TOMORROW },
      { id: "rem-later", tripId: TRIP_ID, title: "Too early", date: "2026-12-03" },
    ];

    const input = await collect({ slot: "EVENING" });

    // A Reminder is read out the evening BEFORE its date, alongside tomorrow's
    // plan (CONTEXT.md **Reminder**): one delivered at 9pm on the day it was
    // for arrives as that day is ending.
    expect(input.reminders).toEqual([{ id: "rem-tomorrow", title: "Ring the landlord" }]);
  });

  it("leaves the schedule empty when the target day is before the trip starts", async () => {
    seedPlanningTrip(); // departs 2026-12-20; the EVENING target is 2026-12-02
    dbData.item = [
      { id: "item-1", tripId: TRIP_ID, forkId: null, date: "2026-12-02", title: "Museum", startTime: "10:00" },
    ];

    const input = await collect();

    expect(input.phase).toBe("planning");
    expect(input.schedule).toEqual({ transports: [], stays: [], items: [] });
  });

  it("leaves the schedule empty when the target day is after the trip ends", async () => {
    dbData.trip = [
      { id: TRIP_ID, startDate: "2026-11-01", endDate: "2026-11-20", homeName: "Sydney" },
    ];
    dbData.item = [
      { id: "item-1", tripId: TRIP_ID, forkId: null, date: "2026-12-02", title: "Museum", startTime: "10:00" },
    ];

    const input = await collect();

    expect(input.phase).toBe("past");
    expect(input.schedule).toEqual({ transports: [], stays: [], items: [] });
  });

  it("carries tomorrow's itinerary on the evening before departure", async () => {
    // The trip departs tomorrow, so today's phase is still final-prep — but
    // this is the digest that must announce the outbound flight.
    dbData.trip = [
      {
        id: TRIP_ID,
        startDate: TOMORROW,
        endDate: "2026-12-12",
        homeName: "Sydney",
        homeCountryCode: "au",
      },
    ];
    dbData.stop = [
      { id: "stop-1", tripId: TRIP_ID, forkId: null, name: "Vienna", timezone: "Europe/Vienna" },
    ];
    dbData.transport = [
      {
        id: "tr-outbound",
        tripId: TRIP_ID,
        forkId: null,
        mode: "FLIGHT",
        fromStopId: null, // the Home base is not a Stop
        toStopId: "stop-1",
        depPlace: null,
        arrPlace: null,
        // 16:15 UTC is 2026-12-02 03:15 in Sydney (AEDT) and still
        // 2026-12-01 17:15 in Vienna.
        depAt: new Date("2026-12-01T16:15:00Z"),
        reference: "QF29",
        depIsHome: true,
        arrIsHome: false,
      },
    ];

    const input = await collect({ slot: "EVENING" });

    expect(input.phase).toBe("final-prep");
    expect(input.schedule.transports).toEqual([
      { id: "tr-outbound", mode: "FLIGHT", route: "Sydney → Vienna", localTime: "03:15" },
    ]);
  });

  it("times a home-base departure in the trip's own zone, not the destination's", async () => {
    // A Home base is not a Stop (CONTEXT.md **Home base**), so the outbound leg
    // always has fromStopId: null. Reading it in the ARRIVAL stop's zone puts a
    // Brisbane 06:00 departure at 21:00 the previous evening in Vienna — the
    // Digest then mistimes the flight AND files it under the wrong day, while
    // the published VALARM (relative to the true UTC instant) stays correct.
    // The Digest exists to back the Alarm up; it must not contradict it.
    dbData.trip = [
      {
        id: TRIP_ID,
        startDate: TOMORROW,
        endDate: "2026-12-12",
        homeName: "Brisbane",
        homeCountryCode: "au",
      },
    ];
    dbData.stop = [
      { id: "stop-1", tripId: TRIP_ID, forkId: null, name: "Vienna", timezone: "Europe/Vienna" },
    ];
    dbData.transport = [
      {
        id: "tr-outbound",
        tripId: TRIP_ID,
        forkId: null,
        mode: "FLIGHT",
        fromStopId: null,
        toStopId: "stop-1",
        depPlace: null,
        arrPlace: null,
        // 2026-12-01T20:00Z: 2026-12-02 in eastern Australia, but still
        // 2026-12-01 21:00 in Vienna.
        depAt: new Date("2026-12-01T20:00:00Z"),
        reference: "QF29",
        depIsHome: true,
        arrIsHome: false,
      },
    ];

    const input = await collect({ slot: "EVENING" });

    // Australia/Sydney, via the trip's homeCountryCode: a country-level guess,
    // so inside a multi-zone country the wall clock can be an hour off
    // (Brisbane keeps AEST while Sydney is on AEDT). The DAY is right, which is
    // what decides whether the flight appears at all — and it is never read in
    // Vienna, where this departure would fall on the wrong date entirely.
    expect(input.schedule.transports).toEqual([
      { id: "tr-outbound", mode: "FLIGHT", route: "Brisbane → Vienna", localTime: "07:00" },
    ]);
  });

  it("prints an outbound departure in the recipient's own zone, not the country guess", async () => {
    // Gold Coast is Queensland — AEST all year. `au` guesses Australia/Sydney,
    // which is AEDT in December, so a 06:00 departure printed as 07:00.
    dbData.trip = [
      {
        id: TRIP_ID,
        startDate: "2026-12-05",
        endDate: "2026-12-30",
        homeName: "Gold Coast",
        homeCountryCode: "au",
      },
    ];
    dbData.stop = [
      {
        id: "munich",
        tripId: TRIP_ID,
        forkId: null,
        name: "Munich",
        timezone: "Europe/Berlin",
        arriveDate: "2026-12-05",
        departDate: "2026-12-10",
      },
    ];
    dbData.transport = [
      {
        id: "t1",
        tripId: TRIP_ID,
        forkId: null,
        mode: "FLIGHT",
        depAt: new Date("2026-12-04T20:00:00Z"),
        depIsHome: true,
        arrIsHome: false,
        fromStopId: null,
        toStopId: "munich",
        depPlace: null,
        arrPlace: null,
        reference: "QF1",
      },
    ];

    const input = await collect({ localDate: "2026-12-04", zone: "Australia/Brisbane" });

    expect(input.schedule.transports[0].localTime).toBe("06:00");
  });

  it("falls back to the country guess when no zone is supplied", async () => {
    dbData.trip = [
      {
        id: TRIP_ID,
        startDate: "2026-12-05",
        endDate: "2026-12-30",
        homeName: "Gold Coast",
        homeCountryCode: "au",
      },
    ];
    dbData.stop = [
      {
        id: "munich",
        tripId: TRIP_ID,
        forkId: null,
        name: "Munich",
        timezone: "Europe/Berlin",
        arriveDate: "2026-12-05",
        departDate: "2026-12-10",
      },
    ];
    dbData.transport = [
      {
        id: "t1",
        tripId: TRIP_ID,
        forkId: null,
        mode: "FLIGHT",
        depAt: new Date("2026-12-04T20:00:00Z"),
        depIsHome: true,
        arrIsHome: false,
        fromStopId: null,
        toStopId: "munich",
        depPlace: null,
        arrPlace: null,
        reference: "QF1",
      },
    ];

    const input = await collect({ localDate: "2026-12-04" });

    expect(input.schedule.transports[0].localTime).toBe("07:00");
  });

  it("still reads a stop-to-stop leg in its departure stop's zone", async () => {
    // The home-base rule must not swallow the ordinary case: a leg that HAS a
    // departure Stop is timed there, not in the trip's home zone.
    dbData.trip = [
      {
        id: TRIP_ID,
        startDate: "2026-11-25",
        endDate: "2026-12-10",
        homeName: "Brisbane",
        homeCountryCode: "au",
      },
    ];
    dbData.stop = [
      { id: "stop-1", tripId: TRIP_ID, forkId: null, name: "Tokyo", timezone: "Asia/Tokyo" },
      { id: "stop-2", tripId: TRIP_ID, forkId: null, name: "Osaka", timezone: "Asia/Tokyo" },
    ];
    dbData.transport = [
      {
        id: "tr-1",
        tripId: TRIP_ID,
        forkId: null,
        mode: "TRAIN",
        fromStopId: "stop-1",
        toStopId: "stop-2",
        depPlace: null,
        arrPlace: null,
        depAt: new Date("2026-12-01T22:00:00Z"), // 07:00 on the 2nd in Tokyo
        reference: null,
        depIsHome: false,
        arrIsHome: false,
      },
    ];

    const input = await collect({ slot: "EVENING" });

    expect(input.schedule.transports).toEqual([
      { id: "tr-1", mode: "TRAIN", route: "Tokyo → Osaka", localTime: "07:00" },
    ]);
  });

  it("names an outbound leg that departs the day BEFORE the trip's start date", async () => {
    // startDate is the day the first Stop ARRIVES (lib/firm-up.ts), so an
    // overnight long-haul outbound leaves the day before it. A gate closed
    // exactly on startDate means no evening Digest ever names that flight and
    // the travel-day morning Digest comes back empty — the same hole ADR 0047's
    // amendment closed, one day earlier.
    dbData.trip = [
      {
        id: TRIP_ID,
        startDate: "2026-12-03", // the first stop is reached on the 3rd
        endDate: "2026-12-12",
        homeName: "Brisbane",
        homeCountryCode: "au",
      },
    ];
    dbData.stop = [
      { id: "stop-1", tripId: TRIP_ID, forkId: null, name: "Vienna", timezone: "Europe/Vienna" },
    ];
    dbData.transport = [
      {
        id: "tr-outbound",
        tripId: TRIP_ID,
        forkId: null,
        mode: "FLIGHT",
        fromStopId: null,
        toStopId: "stop-1",
        depPlace: null,
        arrPlace: null,
        depAt: new Date("2026-12-01T20:00:00Z"), // 2026-12-02 07:00 at home
        reference: "QF29",
        depIsHome: true,
        arrIsHome: false,
      },
    ];

    const input = await collect({ slot: "EVENING" });

    expect(input.schedule.transports).toEqual([
      { id: "tr-outbound", mode: "FLIGHT", route: "Brisbane → Vienna", localTime: "07:00" },
    ]);
  });

  it("names the outbound leg again in the travel-day MORNING digest", async () => {
    // The morning slot is cover for an Alarm the calendar app silently declined
    // to fire, and departure day is the day it matters most. Before the fix it
    // returned nothing at all, because departure day is still outside the gate.
    dbData.trip = [
      {
        id: TRIP_ID,
        startDate: "2026-12-02", // arrives tomorrow; departs today
        endDate: "2026-12-12",
        homeName: "Brisbane",
        homeCountryCode: "au",
      },
    ];
    dbData.stop = [
      { id: "stop-1", tripId: TRIP_ID, forkId: null, name: "Vienna", timezone: "Europe/Vienna" },
    ];
    dbData.transport = [
      {
        id: "tr-outbound",
        tripId: TRIP_ID,
        forkId: null,
        mode: "FLIGHT",
        fromStopId: null,
        toStopId: "stop-1",
        depPlace: null,
        arrPlace: null,
        depAt: new Date("2026-11-30T20:00:00Z"), // 2026-12-01 07:00 at home
        reference: "QF29",
        depIsHome: true,
        arrIsHome: false,
      },
    ];

    const input = await collect({ slot: "MORNING" });

    expect(input.schedule.transports).toEqual([
      { id: "tr-outbound", mode: "FLIGHT", route: "Brisbane → Vienna", localTime: "07:00" },
    ]);
  });

  it("names a return leg that departs the day AFTER the last Stop's depart date", async () => {
    // endDate is the last Stop's DEPART date, and the Home base is not a Stop
    // (CONTEXT.md **Home base**), so a return leg leaving the day after that
    // departure falls outside a gate closed exactly on endDate — the same hole
    // as the outbound case (above), mirrored at the other end of the trip.
    dbData.trip = [
      {
        id: TRIP_ID,
        startDate: "2026-11-25",
        endDate: "2026-12-10", // the last stop is departed on the 10th
        homeName: "Brisbane",
        homeCountryCode: "au",
      },
    ];
    dbData.stop = [
      { id: "stop-1", tripId: TRIP_ID, forkId: null, name: "Vienna", timezone: "Europe/Vienna" },
    ];
    dbData.transport = [
      {
        id: "tr-return",
        tripId: TRIP_ID,
        forkId: null,
        mode: "FLIGHT",
        fromStopId: "stop-1",
        toStopId: null,
        depPlace: null,
        arrPlace: null,
        depAt: new Date("2026-12-11T06:00:00Z"), // 2026-12-11 07:00 in Vienna
        reference: "QF30",
        depIsHome: false,
        arrIsHome: true,
      },
    ];

    // EVENING on the 10th looks ahead to the 11th — endDate + 1.
    const input = await collect({ localDate: "2026-12-10", slot: "EVENING" });

    expect(input.schedule.transports).toEqual([
      { id: "tr-return", mode: "FLIGHT", route: "Vienna → Brisbane", localTime: "07:00" },
    ]);
  });

  it("scopes every plan-entity read to the real plan", async () => {
    // A Fork must never drive reminders (CONTEXT.md **Fork**). The fork rows in
    // the tests above prove the leak is closed for the three date-matched
    // queries; this pins the rule on the label-map and stop reads too, where a
    // fork row cannot change the output only because ids are unique.
    seedTravellingTrip();
    dbData.stop = [
      { id: "stop-1", tripId: TRIP_ID, forkId: null, name: "Vienna", timezone: "Europe/Vienna" },
    ];
    dbData.accommodation = [
      {
        id: "acc-1",
        tripId: TRIP_ID,
        forkId: null,
        name: "Airbnb Vienna",
        checkIn: "2026-12-02",
        checkOut: "2026-12-05",
        checkInTime: null,
        checkOutTime: null,
      },
    ];
    dbData.cost = [
      {
        id: "cost-1",
        tripId: TRIP_ID,
        forkId: null,
        paidAt: null,
        dueDate: LOCAL_DATE,
        costMinor: 24000,
        currency: "EUR",
        label: null,
        ownerType: "ACCOMMODATION",
        ownerId: "acc-1",
      },
    ];

    await collect({ slot: "EVENING" });

    // Checklists and Reminders are trip-wide, so they carry no forkId.
    const planScoped = {
      cost: costFindManyMock,
      stop: stopFindManyMock,
      transport: transportFindManyMock,
      item: itemFindManyMock,
      accommodation: accommodationFindManyMock,
    };
    for (const [name, mock] of Object.entries(planScoped)) {
      expect(mock, `${name} was never queried`).toHaveBeenCalled();
      for (const [args] of mock.mock.calls) {
        expect(args?.where, `${name} read beyond the real plan`).toHaveProperty("forkId", null);
      }
    }
  });

  it("reads tomorrow's plan for the EVENING slot", async () => {
    seedTravellingTrip();
    dbData.item = [
      { id: "item-today", tripId: TRIP_ID, forkId: null, date: LOCAL_DATE, title: "Today's museum", startTime: "10:00" },
      { id: "item-tomorrow", tripId: TRIP_ID, forkId: null, date: "2026-12-02", title: "Tomorrow's castle", startTime: "11:30" },
      { id: "item-fork", tripId: TRIP_ID, forkId: "fork-1", date: "2026-12-02", title: "What-if walk", startTime: "09:00" },
    ];

    const input = await collect({ slot: "EVENING" });

    expect(input.phase).toBe("travelling");
    expect(input.schedule.items).toEqual([
      { id: "item-tomorrow", title: "Tomorrow's castle", localTime: "11:30" },
    ]);
  });

  it("reads today's plan for the MORNING slot", async () => {
    seedTravellingTrip();
    dbData.item = [
      { id: "item-today", tripId: TRIP_ID, forkId: null, date: LOCAL_DATE, title: "Today's museum", startTime: null },
      { id: "item-tomorrow", tripId: TRIP_ID, forkId: null, date: "2026-12-02", title: "Tomorrow's castle", startTime: "11:30" },
    ];

    const input = await collect({ slot: "MORNING" });

    expect(input.schedule.items).toEqual([
      { id: "item-today", title: "Today's museum", localTime: null },
    ]);
  });

  it("MORNING does not query payments, checklist or reminders — it discards them", async () => {
    // collectLines (lib/digest.ts) only renders payments, checklist and
    // reminders on the EVENING slot. Querying them for MORNING wakes Neon for
    // reads that are thrown away, which is odd in a design whose whole cadence
    // argument (ADR 0047) is denominated in CU-hours.
    seedTravellingTrip();

    const input = await collect({ slot: "MORNING" });

    expect(costFindManyMock).not.toHaveBeenCalled();
    expect(checklistItemFindManyMock).not.toHaveBeenCalled();
    expect(reminderFindManyMock).not.toHaveBeenCalled();

    // The shape must survive the skip: buildDigest and its own tests rely on
    // these being present as empty arrays, never undefined.
    expect(input.payments).toEqual([]);
    expect(input.checklist).toEqual([]);
    expect(input.reminders).toEqual([]);
  });

  it("matches a departure by the stop's timezone, not UTC", async () => {
    seedTravellingTrip();
    dbData.stop = [
      { id: "stop-1", tripId: TRIP_ID, forkId: null, name: "Tokyo", timezone: "Asia/Tokyo" },
      { id: "stop-2", tripId: TRIP_ID, forkId: null, name: "Osaka", timezone: "Asia/Tokyo" },
      { id: "stop-f1", tripId: TRIP_ID, forkId: "fork-1", name: "Fork Kyoto", timezone: "Asia/Tokyo" },
    ];
    dbData.transport = [
      {
        // 2026-12-01T22:00Z is 2026-12-02 07:00 in Tokyo — tomorrow, so in.
        id: "tr-in",
        tripId: TRIP_ID,
        forkId: null,
        mode: "TRAIN",
        fromStopId: "stop-1",
        toStopId: "stop-2",
        depPlace: null,
        arrPlace: null,
        depAt: new Date("2026-12-01T22:00:00Z"),
        reference: null,
        depIsHome: false,
        arrIsHome: false,
      },
      {
        // 2026-12-02T23:30Z is 2026-12-03 08:30 in Tokyo — the day after, so out.
        id: "tr-out",
        tripId: TRIP_ID,
        forkId: null,
        mode: "TRAIN",
        fromStopId: "stop-1",
        toStopId: "stop-2",
        depPlace: null,
        arrPlace: null,
        depAt: new Date("2026-12-02T23:30:00Z"),
        reference: null,
        depIsHome: false,
        arrIsHome: false,
      },
      {
        // A what-if leg on the same day: a Fork must never drive reminders.
        id: "tr-fork",
        tripId: TRIP_ID,
        forkId: "fork-1",
        mode: "FLIGHT",
        fromStopId: "stop-f1",
        toStopId: "stop-2",
        depPlace: null,
        arrPlace: null,
        depAt: new Date("2026-12-01T22:30:00Z"),
        reference: null,
        depIsHome: false,
        arrIsHome: false,
      },
    ];

    const input = await collect({ slot: "EVENING" });

    expect(input.schedule.transports).toEqual([
      { id: "tr-in", mode: "TRAIN", route: "Tokyo → Osaka", localTime: "07:00" },
    ]);
  });

  it("reads a stay's check-out before its check-in and carries the times", async () => {
    seedTravellingTrip();
    dbData.accommodation = [
      {
        id: "acc-out",
        tripId: TRIP_ID,
        forkId: null,
        name: "Hotel Sacher",
        checkIn: "2026-11-29",
        checkOut: "2026-12-02",
        checkInTime: "15:00",
        checkOutTime: "11:00",
      },
      {
        id: "acc-in",
        tripId: TRIP_ID,
        forkId: null,
        name: "Pension Prague",
        checkIn: "2026-12-02",
        checkOut: "2026-12-05",
        checkInTime: null,
        checkOutTime: "10:00",
      },
      {
        id: "acc-elsewhen",
        tripId: TRIP_ID,
        forkId: null,
        name: "Not tomorrow",
        checkIn: "2026-12-06",
        checkOut: "2026-12-08",
        checkInTime: null,
        checkOutTime: null,
      },
      {
        // A what-if stay on the same day: a Fork must never drive reminders.
        id: "acc-fork",
        tripId: TRIP_ID,
        forkId: "fork-1",
        name: "What-if hostel",
        checkIn: "2026-12-02",
        checkOut: "2026-12-04",
        checkInTime: "14:00",
        checkOutTime: null,
      },
    ];

    const input = await collect({ slot: "EVENING" });

    expect(input.schedule.stays).toEqual([
      { id: "acc-out", name: "Hotel Sacher", kind: "CHECK_OUT", localTime: "11:00" },
      { id: "acc-in", name: "Pension Prague", kind: "CHECK_IN", localTime: null },
    ]);
  });

  it("returns an empty, sketching input for a trip that no longer exists", async () => {
    dbData.trip = [];

    const input = await collect();

    expect(input).toEqual({
      tripId: TRIP_ID,
      slot: "EVENING",
      phase: "sketching",
      payments: [],
      checklist: [],
      reminders: [{ id: "rem-1", title: "Print insurance docs" }],
      schedule: { transports: [], stays: [], items: [] },
    });
  });
});
