import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Tests for the cron Digest dispatcher — focused on the fail-closed auth gate
 * and the VAPID guard (highest-risk code), plus the slot routing: which
 * subscribers are at 07:00 or 20:00 in their OWN timezone at the instant the
 * run happens, and which trips each of them gets a Digest for.
 *
 * `@/lib/digest-dispatch` is mocked throughout: what a Digest *says* is
 * lib/digest.test.ts's job. Here we only assert who is dispatched to, with
 * which slot, on which local date. `@/lib/tz` is deliberately NOT mocked — the
 * real Intl conversion is the thing under test.
 */

const {
  pushFindManyMock,
  tripMemberFindManyMock,
  isPushConfiguredMock,
  dispatchDigestMock,
} = vi.hoisted(() => ({
  pushFindManyMock: vi.fn(),
  tripMemberFindManyMock: vi.fn(),
  isPushConfiguredMock: vi.fn(),
  dispatchDigestMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    pushSubscription: { findMany: pushFindManyMock },
    tripMember: { findMany: tripMemberFindManyMock },
  },
}));
vi.mock("@/lib/push", () => ({
  isPushConfigured: isPushConfiguredMock,
}));
vi.mock("@/lib/digest-dispatch", () => ({
  dispatchDigest: dispatchDigestMock,
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

/** A PushSubscription row as the route selects it. */
function sub(userId: string, timezone: string | null) {
  return { userId, timezone };
}

beforeEach(() => {
  // Push is configured by default; the VAPID-misconfiguration guard has its
  // own describe block below.
  isPushConfiguredMock.mockReturnValue(true);
  pushFindManyMock.mockResolvedValue([]);
  tripMemberFindManyMock.mockResolvedValue([]);
  dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/cron/reminders — auth (fail-closed)", () => {
  it("returns 401 when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(req({ secret: "anything" }));
    expect(res.status).toBe(401);
    expect(pushFindManyMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the provided secret is wrong", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    const res = await GET(req({ secret: "wrong" }));
    expect(res.status).toBe(401);
    expect(pushFindManyMock).not.toHaveBeenCalled();
  });

  it("returns 200 with the correct secret via query param", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    const res = await GET(req({ secret: "right" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      considered: 0,
      dispatched: 0,
      sent: 0,
      skipped: 0,
    });
  });

  it("returns 200 with the correct secret via Authorization header", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    const res = await GET(req({ header: "Bearer right" }));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/cron/reminders — VAPID misconfiguration guard", () => {
  it("returns 503 before touching the database when VAPID is unconfigured", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    isPushConfiguredMock.mockReturnValue(false);
    const res = await GET(req({ secret: "right" }));
    expect(res.status).toBe(503);
    // The whole point: dispatchDigest claims its ledger slot BEFORE sending,
    // so a run attempted while push cannot deliver would burn every
    // subscriber's slot for the day. Nothing is read and nobody is dispatched
    // to while VAPID is missing — and Neon is never woken for it.
    expect(pushFindManyMock).not.toHaveBeenCalled();
    expect(tripMemberFindManyMock).not.toHaveBeenCalled();
    expect(dispatchDigestMock).not.toHaveBeenCalled();
  });

  it("auth still runs first: bad secret is 401 even when push is unconfigured", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    isPushConfiguredMock.mockReturnValue(false);
    const res = await GET(req({ secret: "wrong" }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/cron/reminders — slot dispatch", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "right");
    vi.useFakeTimers();
  });

  it("dispatches an evening digest to a subscriber whose local time is 20:00", async () => {
    // Europe/Vienna is UTC+1 in December, so 19:00Z is 20:00 local.
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([sub("user-1", "Europe/Vienna")]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);

    const res = await GET(req({ secret: "right" }));

    expect(res.status).toBe(200);
    expect(dispatchDigestMock).toHaveBeenCalledTimes(1);
    expect(dispatchDigestMock).toHaveBeenCalledWith({
      userId: "user-1",
      tripId: "trip-1",
      localDate: "2026-12-01",
      slot: "EVENING",
    });
    expect(await res.json()).toEqual({
      considered: 1,
      dispatched: 1,
      sent: 1,
      skipped: 0,
    });
  });

  it("dispatches a morning digest at local 07:00", async () => {
    // 06:00Z is 07:00 in Vienna (UTC+1 in December).
    vi.setSystemTime(new Date("2026-12-01T06:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([sub("user-1", "Europe/Vienna")]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);

    await GET(req({ secret: "right" }));

    expect(dispatchDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({ slot: "MORNING", localDate: "2026-12-01" }),
    );
  });

  it("reads the local date in the subscriber's zone, not UTC", async () => {
    // One instant, two zones, two different answers — the assertion that
    // would fail if the route used UTC anywhere. At 20:00Z, Sydney
    // (UTC+11 in December) is already 07:00 on the NEXT day, so the Sydney
    // traveller gets a MORNING digest dated 2026-12-02; Vienna is at 21:00
    // local, which is neither slot hour.
    vi.setSystemTime(new Date("2026-12-01T20:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([
      sub("user-syd", "Australia/Sydney"),
      sub("user-vie", "Europe/Vienna"),
    ]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);

    const res = await GET(req({ secret: "right" }));

    expect(dispatchDigestMock).toHaveBeenCalledTimes(1);
    expect(dispatchDigestMock).toHaveBeenCalledWith({
      userId: "user-syd",
      tripId: "trip-1",
      localDate: "2026-12-02",
      slot: "MORNING",
    });
    expect(await res.json()).toEqual({
      considered: 2,
      dispatched: 1,
      sent: 1,
      skipped: 0,
    });
  });

  it("skips a subscriber whose local hour is neither 7 nor 20", async () => {
    // 12:00Z is 13:00 in Vienna — no slot.
    vi.setSystemTime(new Date("2026-12-01T12:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([sub("user-1", "Europe/Vienna")]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);

    const res = await GET(req({ secret: "right" }));

    expect(dispatchDigestMock).not.toHaveBeenCalled();
    // Not even the trip lookup runs for a subscriber outside a slot hour.
    expect(tripMemberFindManyMock).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      considered: 1,
      dispatched: 0,
      sent: 0,
      skipped: 0,
    });
  });

  it("skips subscriptions with no stored timezone", async () => {
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([
      sub("user-1", null),
      sub("user-2", "Europe/Vienna"),
    ]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);

    const res = await GET(req({ secret: "right" }));

    // A row with no timezone cannot be scheduled — there is no local hour to
    // compare against. It is never guessed at and never dispatched to.
    expect(dispatchDigestMock).toHaveBeenCalledTimes(1);
    expect(dispatchDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-2" }),
    );
    expect((await res.json()).considered).toBe(1);
    // The query itself asks only for rows that can be scheduled.
    expect(pushFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { timezone: { not: null } },
        select: { userId: true, timezone: true },
      }),
    );
  });

  it("dispatches once per user per trip when a user has several devices in one zone", async () => {
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    // Phone, laptop and tablet, all in Vienna. dispatchDigest already pushes
    // to every subscription the user owns, so dispatching per subscription
    // would put three identical Digests on the same phone.
    pushFindManyMock.mockResolvedValue([
      sub("user-1", "Europe/Vienna"),
      sub("user-1", "Europe/Vienna"),
      sub("user-1", "Europe/Vienna"),
    ]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);

    const res = await GET(req({ secret: "right" }));

    expect(dispatchDigestMock).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({
      considered: 1,
      dispatched: 1,
      sent: 1,
      skipped: 0,
    });
  });

  it("dispatches per trip for a user in two trips", async () => {
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([sub("user-1", "Europe/Vienna")]);
    tripMemberFindManyMock.mockResolvedValue([
      { tripId: "trip-1" },
      { tripId: "trip-2" },
    ]);

    const res = await GET(req({ secret: "right" }));

    expect(dispatchDigestMock).toHaveBeenCalledTimes(2);
    expect(dispatchDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: "trip-1", slot: "EVENING" }),
    );
    expect(dispatchDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: "trip-2", slot: "EVENING" }),
    );
    expect(await res.json()).toEqual({
      considered: 1,
      dispatched: 2,
      sent: 2,
      skipped: 0,
    });
  });

  it("counts a skipped dispatch without counting it as sent", async () => {
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([sub("user-1", "Europe/Vienna")]);
    tripMemberFindManyMock.mockResolvedValue([
      { tripId: "trip-1" },
      { tripId: "trip-2" },
    ]);
    dispatchDigestMock
      .mockResolvedValueOnce({ sent: 0, skipped: true, reason: "empty" })
      .mockResolvedValueOnce({ sent: 2, skipped: false });

    const res = await GET(req({ secret: "right" }));

    expect(await res.json()).toEqual({
      considered: 1,
      dispatched: 2,
      sent: 2,
      skipped: 1,
    });
  });

  it("bounds the per-user trip lookup with take: 50", async () => {
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([sub("user-1", "Europe/Vienna")]);

    await GET(req({ secret: "right" }));

    expect(tripMemberFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        select: { tripId: true },
        take: 50,
      }),
    );
  });

  it("reports partial counts and 500 when dispatch throws", async () => {
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([sub("user-1", "Europe/Vienna")]);
    tripMemberFindManyMock.mockResolvedValue([
      { tripId: "trip-1" },
      { tripId: "trip-2" },
    ]);
    dispatchDigestMock
      .mockResolvedValueOnce({ sent: 1, skipped: false })
      .mockRejectedValueOnce(new Error("boom"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(req({ secret: "right" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Internal server error",
      considered: 1,
      dispatched: 1,
      sent: 1,
      skipped: 0,
    });
    errorSpy.mockRestore();
  });
});
