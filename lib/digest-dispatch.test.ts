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
 * `buildNotificationPayload` runs so the payload the device would receive is
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
  pushSubscriptionFindManyMock,
  pushSubscriptionDeleteManyMock,
  sendPushMock,
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
    pushSubscriptionFindManyMock: findMany("pushSubscription"),
    pushSubscriptionDeleteManyMock: vi.fn(),
    sendPushMock: vi.fn(),
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

// Import after the mocks.
import {
  DIGEST_LOOKAHEAD_DAYS,
  collectDigestInput,
  dispatchDigest,
} from "@/lib/digest-dispatch";

const USER_ID = "user-1";
const TRIP_ID = "trip-1";
const LOCAL_DATE = "2026-12-01";

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
  // The simplest non-empty EVENING digest: one Reminder dated today.
  dbData.reminder = [{ id: "rem-1", tripId: TRIP_ID, title: "Print insurance docs", date: LOCAL_DATE }];
  seedSubscription("sub-1");
  digestPreferenceFindUniqueMock.mockResolvedValue(null);
  digestDispatchCreateMock.mockResolvedValue({ id: "dd-1" });
  digestDispatchDeleteMock.mockResolvedValue({});
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

  it("does not delete a ledger row it never claimed when a forced digest is empty", async () => {
    dbData.reminder = [];

    const result = await dispatch({ force: true });

    expect(result).toEqual({ sent: 0, skipped: true, reason: "empty" });
    expect(digestDispatchDeleteMock).not.toHaveBeenCalled();
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

  it("collects only undone checklist items inside the lookahead window", async () => {
    dbData.checklistItem = [
      { id: "chk-1", tripId: TRIP_ID, done: false, dueDate: "2026-12-02", text: "Apply for the visa" },
      { id: "chk-done", tripId: TRIP_ID, done: true, dueDate: LOCAL_DATE, text: "Buy an eSIM" },
      { id: "chk-late", tripId: TRIP_ID, done: false, dueDate: "2026-12-05", text: "Pack" },
      { id: "chk-undated", tripId: TRIP_ID, done: false, dueDate: null, text: "Someday" },
    ];

    const input = await collect();

    expect(input.checklist).toEqual([
      { id: "chk-1", text: "Apply for the visa", daysUntil: 1 },
    ]);
  });

  it("matches reminders on exactly the local date", async () => {
    dbData.reminder = [
      { id: "rem-today", tripId: TRIP_ID, title: "Print insurance docs", date: LOCAL_DATE },
      { id: "rem-tomorrow", tripId: TRIP_ID, title: "Ring the landlord", date: "2026-12-02" },
      { id: "rem-yesterday", tripId: TRIP_ID, title: "Old news", date: "2026-11-30" },
    ];

    const input = await collect();

    // A Reminder is said once, on its day — never carried forward or pulled in early.
    expect(input.reminders).toEqual([{ id: "rem-today", title: "Print insurance docs" }]);
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
      { id: TRIP_ID, startDate: "2026-12-02", endDate: "2026-12-12", homeName: "Sydney" },
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
        depAt: new Date("2026-12-02T05:15:00Z"), // 06:15 in Vienna
        reference: "QF29",
        depIsHome: true,
        arrIsHome: false,
      },
    ];

    const input = await collect({ slot: "EVENING" });

    expect(input.phase).toBe("final-prep");
    expect(input.schedule.transports).toEqual([
      { id: "tr-outbound", mode: "FLIGHT", route: "Sydney → Vienna", localTime: "06:15" },
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
