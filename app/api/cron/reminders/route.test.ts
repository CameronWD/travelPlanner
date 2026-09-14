import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { addDays } from "@/lib/dates";

/**
 * Tests for the cron reminders endpoint — focused on the fail-closed auth gate
 * (highest-risk code) plus the basic processing path, plus the due-date
 * payment-alert second pass (Task 13, CONTEXT.md "Due date").
 */

const {
  reminderFindManyMock,
  reminderUpdateMock,
  reminderFindFirstMock,
  reminderCreateMock,
  pushFindManyMock,
  pushDeleteManyMock,
  sendPushMock,
  tripFindUniqueMock,
  costFindManyMock,
  itemFindManyMock,
  accommodationFindManyMock,
  transportFindManyMock,
  stopFindManyMock,
} = vi.hoisted(() => ({
  reminderFindManyMock: vi.fn(),
  reminderUpdateMock: vi.fn(),
  reminderFindFirstMock: vi.fn(),
  reminderCreateMock: vi.fn(),
  pushFindManyMock: vi.fn(),
  pushDeleteManyMock: vi.fn(),
  sendPushMock: vi.fn(),
  tripFindUniqueMock: vi.fn(),
  costFindManyMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  accommodationFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn(),
  stopFindManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    reminder: {
      findMany: reminderFindManyMock,
      update: reminderUpdateMock,
      findFirst: reminderFindFirstMock,
      create: reminderCreateMock,
    },
    pushSubscription: {
      findMany: pushFindManyMock,
      deleteMany: pushDeleteManyMock,
    },
    trip: { findUnique: tripFindUniqueMock },
    cost: { findMany: costFindManyMock },
    item: { findMany: itemFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    transport: { findMany: transportFindManyMock },
    stop: { findMany: stopFindManyMock },
  },
}));
vi.mock("@/lib/push", () => ({
  sendPush: sendPushMock,
  buildNotificationPayload: ({
    title,
    body,
    url,
  }: {
    title: string;
    body: string;
    url: string;
  }) => JSON.stringify({ title, body, url }),
}));

import { GET } from "./route";

function req(opts: { secret?: string; header?: string } = {}): NextRequest {
  const url = opts.secret
    ? `http://localhost/api/cron/reminders?secret=${opts.secret}`
    : "http://localhost/api/cron/reminders";
  return new NextRequest(url, {
    headers: opts.header ? { authorization: opts.header } : {},
  });
}

function dueCost(overrides: Partial<{
  id: string;
  tripId: string;
  dueDate: string;
  costMinor: number;
  currency: string;
  label: string | null;
  ownerType: string;
  ownerId: string | null;
}> = {}) {
  return {
    id: "cost-1",
    tripId: "trip-1",
    dueDate: "2026-09-17",
    costMinor: 50000,
    currency: "AUD",
    label: "Flight to NRT",
    ownerType: "OTHER",
    ownerId: null,
    ...overrides,
  };
}

const todayUTC = new Date().toISOString().slice(0, 10);
const threeDaysFromNow = addDays(todayUTC, 3);

beforeEach(() => {
  // Sensible no-op defaults for the second pass so pre-existing (first-pass)
  // tests don't need to know about it.
  costFindManyMock.mockResolvedValue([]);
  tripFindUniqueMock.mockResolvedValue({ members: [] });
  itemFindManyMock.mockResolvedValue([]);
  accommodationFindManyMock.mockResolvedValue([]);
  transportFindManyMock.mockResolvedValue([]);
  stopFindManyMock.mockResolvedValue([]);
  reminderFindFirstMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/cron/reminders — auth (fail-closed)", () => {
  it("returns 401 when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(req({ secret: "anything" }));
    expect(res.status).toBe(401);
    expect(reminderFindManyMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the provided secret is wrong", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    const res = await GET(req({ secret: "wrong" }));
    expect(res.status).toBe(401);
    expect(reminderFindManyMock).not.toHaveBeenCalled();
  });

  it("returns 200 with the correct secret via query param", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    reminderFindManyMock.mockResolvedValue([]);
    const res = await GET(req({ secret: "right" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      processed: 0,
      sent: 0,
      skipped: 0,
      dueAlerts: 0,
    });
  });

  it("returns 200 with the correct secret via Authorization header", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    reminderFindManyMock.mockResolvedValue([]);
    const res = await GET(req({ header: "Bearer right" }));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/cron/reminders — processing", () => {
  it("processes a due reminder, skips push when unconfigured, and marks it sent", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    reminderFindManyMock.mockResolvedValue([
      {
        id: "rem-1",
        tripId: "trip-1",
        title: "Check in opens",
      },
    ]);
    tripFindUniqueMock.mockResolvedValue({ members: [{ userId: "user-1" }] });
    pushFindManyMock.mockResolvedValue([
      { id: "sub-1", endpoint: "https://e", p256dh: "p", auth: "a" },
    ]);
    sendPushMock.mockResolvedValue({ sent: false, skipped: true });

    const res = await GET(req({ secret: "right" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      processed: 1,
      sent: 0,
      skipped: 1,
      dueAlerts: 0,
    });
    expect(reminderUpdateMock).toHaveBeenCalledWith({
      where: { id: "rem-1" },
      data: { sent: true },
    });
  });

  it("processes at most 200 due reminders per run, oldest first", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    reminderFindManyMock.mockResolvedValue([]);

    await GET(req({ secret: "right" }));

    expect(reminderFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200, orderBy: { fireAt: "asc" } }),
    );
  });
});

describe("GET /api/cron/reminders — due-date payment alerts", () => {
  it("pushes a 3-days-before alert for an unpaid cost due in 3 days and records a COST_DUE marker", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    reminderFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([dueCost({ dueDate: threeDaysFromNow })]);
    tripFindUniqueMock.mockResolvedValue({ members: [{ userId: "user-1" }] });
    pushFindManyMock.mockResolvedValue([
      { id: "sub-1", endpoint: "https://e", p256dh: "p", auth: "a" },
    ]);
    sendPushMock.mockResolvedValue({ sent: true });

    const res = await GET(req({ secret: "right" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dueAlerts).toBe(1);

    expect(sendPushMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendPushMock.mock.calls[0][1] as string);
    expect(payload.title).toBe("Payment coming up");
    expect(payload.body).toBe("Flight to NRT · $500.00 comes out in 3 days");
    expect(payload.url).toBe("/trips/trip-1/budget");

    expect(reminderCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip-1",
        title: "Flight to NRT · $500.00 comes out in 3 days",
        sent: true,
        targetType: "COST_DUE",
        targetId: "cost-1",
      }),
    });
  });

  it("pushes a due-today alert with 'comes out today' wording", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    reminderFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([dueCost({ dueDate: todayUTC })]);
    tripFindUniqueMock.mockResolvedValue({ members: [{ userId: "user-1" }] });
    pushFindManyMock.mockResolvedValue([]);

    const res = await GET(req({ secret: "right" }));
    const body = await res.json();

    expect(body.dueAlerts).toBe(1);
    expect(reminderCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Flight to NRT · $500.00 comes out today",
      }),
    });
  });

  it("skips a cost whose marker for this alert already exists", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    reminderFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([dueCost({ dueDate: threeDaysFromNow })]);
    reminderFindFirstMock.mockResolvedValue({ id: "existing-marker" });

    const res = await GET(req({ secret: "right" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dueAlerts).toBe(0);
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(reminderCreateMock).not.toHaveBeenCalled();
  });

  it("ignores paid costs and costs due at other offsets", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    reminderFindManyMock.mockResolvedValue([]);
    // The db query itself filters paidAt: null; here we simulate costs whose
    // offsets don't match the alert schedule to prove the offset check works.
    costFindManyMock.mockResolvedValue([
      dueCost({ id: "cost-far", dueDate: addDays(todayUTC, 10) }),
      dueCost({ id: "cost-past", dueDate: addDays(todayUTC, -1) }),
      dueCost({ id: "cost-one-day", dueDate: addDays(todayUTC, 1) }),
    ]);

    const res = await GET(req({ secret: "right" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dueAlerts).toBe(0);
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(reminderCreateMock).not.toHaveBeenCalled();
  });

  it("queries only unpaid, non-forked, due-dated costs", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    reminderFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);

    await GET(req({ secret: "right" }));

    expect(costFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dueDate: { not: null },
          paidAt: null,
          forkId: null,
        }),
      }),
    );
  });

  it("resolves an owned cost's label via the trip's items and includes it in the push body", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    reminderFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([
      dueCost({
        id: "cost-item",
        dueDate: todayUTC,
        ownerType: "ITEM",
        ownerId: "item-1",
        label: null,
      }),
    ]);
    itemFindManyMock.mockResolvedValue([{ id: "item-1", title: "Louvre tickets" }]);
    tripFindUniqueMock.mockResolvedValue({ members: [{ userId: "user-1" }] });
    pushFindManyMock.mockResolvedValue([
      { id: "sub-1", endpoint: "https://e", p256dh: "p", auth: "a" },
    ]);
    sendPushMock.mockResolvedValue({ sent: true });

    const res = await GET(req({ secret: "right" }));
    const body = await res.json();

    expect(body.dueAlerts).toBe(1);
    const payload = JSON.parse(sendPushMock.mock.calls[0][1] as string);
    expect(payload.body).toBe("Louvre tickets · $500.00 comes out today");
  });

  it("creates a distinct marker per calendar day so a cost due at both offsets can't double-send on one day", async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv("CRON_SECRET", "right");
      reminderFindManyMock.mockResolvedValue([]);
      tripFindUniqueMock.mockResolvedValue({ members: [] });

      const dueDate = "2026-09-20";

      // Day 1: today = dueDate - 3 → the 3-day alert fires.
      vi.setSystemTime(new Date("2026-09-17T08:00:00.000Z"));
      costFindManyMock.mockResolvedValue([dueCost({ dueDate })]);
      reminderFindFirstMock.mockResolvedValue(null);

      const res1 = await GET(req({ secret: "right" }));
      expect((await res1.json()).dueAlerts).toBe(1);
      expect(reminderCreateMock).toHaveBeenCalledTimes(1);
      const fireAt1 = (
        reminderCreateMock.mock.calls[0][0] as { data: { fireAt: Date } }
      ).data.fireAt;

      // Re-running the cron later the same day must not resend: a marker
      // for this exact fireAt now exists.
      reminderFindFirstMock.mockResolvedValue({ id: "marker-1" });
      const resSameDay = await GET(req({ secret: "right" }));
      expect((await resSameDay.json()).dueAlerts).toBe(0);
      expect(reminderCreateMock).toHaveBeenCalledTimes(1);

      // Day 2: today = dueDate → the due-today alert fires, keyed by a
      // fireAt distinct from Day 1's marker, so it isn't blocked by it.
      vi.setSystemTime(new Date("2026-09-20T08:00:00.000Z"));
      reminderFindFirstMock.mockResolvedValue(null);
      const res2 = await GET(req({ secret: "right" }));
      expect((await res2.json()).dueAlerts).toBe(1);
      expect(reminderCreateMock).toHaveBeenCalledTimes(2);
      const fireAt2 = (
        reminderCreateMock.mock.calls[1][0] as { data: { fireAt: Date } }
      ).data.fireAt;

      expect(fireAt1.toISOString()).not.toBe(fireAt2.toISOString());

      // And re-running Day 2 again must not resend either.
      reminderFindFirstMock.mockResolvedValue({ id: "marker-2" });
      const resDay2Again = await GET(req({ secret: "right" }));
      expect((await resDay2Again.json()).dueAlerts).toBe(0);
      expect(reminderCreateMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
