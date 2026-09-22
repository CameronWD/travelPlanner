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
  cronHeartbeatUpsertMock,
  cronHeartbeatUpdateMock,
  reportErrorMock,
} = vi.hoisted(() => ({
  pushFindManyMock: vi.fn(),
  tripMemberFindManyMock: vi.fn(),
  isPushConfiguredMock: vi.fn(),
  dispatchDigestMock: vi.fn(),
  cronHeartbeatUpsertMock: vi.fn(),
  cronHeartbeatUpdateMock: vi.fn(),
  reportErrorMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    pushSubscription: { findMany: pushFindManyMock },
    tripMember: { findMany: tripMemberFindManyMock },
    cronHeartbeat: {
      upsert: cronHeartbeatUpsertMock,
      // `update` is the lastSuccessAt stamp. It is a separate mock from
      // `upsert` because the two heartbeat writes mean different things and
      // the tests below turn on which of them ran.
      update: cronHeartbeatUpdateMock,
    },
  },
}));
vi.mock("@/lib/push", () => ({
  isPushConfigured: isPushConfiguredMock,
}));
vi.mock("@/lib/digest-dispatch", () => ({
  dispatchDigest: dispatchDigestMock,
}));
// ARCH-OBS-1: the route reports best-effort-write and whole-run failures to
// the error sink. Mocked entirely here (same as @/lib/digest-dispatch above)
// — reportError's own behaviour is lib/error-sink.test.ts's job.
vi.mock("@/lib/error-sink", () => ({
  reportError: reportErrorMock,
}));

import { GET } from "./route";

function req(opts: { secret?: string; header?: string } = {}): NextRequest {
  const url = opts.secret
    ? `http://localhost/api/cron/digest?secret=${opts.secret}`
    : "http://localhost/api/cron/digest";
  return new NextRequest(url, {
    headers: opts.header ? { authorization: opts.header } : {},
  });
}

/**
 * A PushSubscription row as the route selects it. `lastSeenAt` defaults to a
 * fixed instant — fine for every test here except the zone-tiebreak tests,
 * which pass their own `lastSeenAt` values explicitly.
 */
function sub(userId: string, timezone: string | null) {
  return { userId, timezone, lastSeenAt: new Date("2026-01-01T00:00:00Z") };
}

beforeEach(() => {
  // Push is configured by default; the VAPID-misconfiguration guard has its
  // own describe block below.
  isPushConfiguredMock.mockReturnValue(true);
  pushFindManyMock.mockResolvedValue([]);
  tripMemberFindManyMock.mockResolvedValue([]);
  dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false });
  cronHeartbeatUpsertMock.mockResolvedValue({ id: "digest", lastRunAt: new Date() });
  cronHeartbeatUpdateMock.mockResolvedValue({ id: "digest", lastSuccessAt: new Date() });
  reportErrorMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  // resetAllMocks (not clearAllMocks): clearAllMocks only wipes recorded
  // calls, it leaves any queued `mockResolvedValueOnce`/`mockRejectedValueOnce`
  // values sitting in the mock's queue, so a test that pushes more `…Once`
  // values than it consumes leaks the remainder into whichever test runs
  // next. resetAllMocks drains that queue too. It also drops the default
  // implementations set below — the top-level `beforeEach` above re-applies
  // them before every test, including the first one after this reset.
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/cron/digest — auth (fail-closed)", () => {
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
      failed: 0,
    });
  });

  it("returns 200 with the correct secret via Authorization header", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    const res = await GET(req({ header: "Bearer right" }));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/cron/digest — VAPID misconfiguration guard", () => {
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

describe("GET /api/cron/digest — heartbeat (lib/cron-health.ts)", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "right");
  });

  it("stamps the heartbeat even when no subscriptions exist", async () => {
    // The heartbeat exists precisely to distinguish "nothing to say" from "the
    // scheduler stopped" — an empty subscriber list is the ordinary case it
    // must still record.
    pushFindManyMock.mockResolvedValue([]);

    const res = await GET(req({ secret: "right" }));

    expect(res.status).toBe(200);
    expect(cronHeartbeatUpsertMock).toHaveBeenCalledWith({
      where: { id: "digest" },
      create: { id: "digest", lastRunAt: expect.any(Date) },
      update: { lastRunAt: expect.any(Date) },
    });
  });

  it("does not stamp the heartbeat when VAPID is unconfigured", async () => {
    // A run that cannot deliver anything has not meaningfully "run" — the
    // heartbeat write sits after the VAPID bail, not before it.
    isPushConfiguredMock.mockReturnValue(false);

    await GET(req({ secret: "right" }));

    expect(cronHeartbeatUpsertMock).not.toHaveBeenCalled();
  });

  it("still dispatches normally when the heartbeat write throws", async () => {
    // Best-effort by design: a failed heartbeat write must never cost anyone
    // their Digest.
    cronHeartbeatUpsertMock.mockRejectedValue(new Error("db unavailable"));
    pushFindManyMock.mockResolvedValue([sub("user-1", "Europe/Vienna")]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));

    const res = await GET(req({ secret: "right" }));

    expect(res.status).toBe(200);
    expect(dispatchDigestMock).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({
      considered: 1,
      dispatched: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
    // ARCH-OBS-1: a best-effort write failing is still worth a row in the
    // error sink, even though the run itself must not be affected by it.
    expect(reportErrorMock).toHaveBeenCalledWith(expect.any(Error), {
      route: "/api/cron/digest",
      source: "server",
    });
  });

  it("stamps lastSuccessAt on a quiet run — nothing sent, nothing failed", async () => {
    // The ordinary case the two-signal design exists to call healthy: nobody
    // was in a window, so no Digest was due and none was missed.
    pushFindManyMock.mockResolvedValue([]);

    await GET(req({ secret: "right" }));

    expect(cronHeartbeatUpdateMock).toHaveBeenCalledWith({
      where: { id: "digest" },
      data: { lastSuccessAt: expect.any(Date) },
    });
  });

  it("stamps lastSuccessAt when one trip fails but another is delivered", async () => {
    // The per-trip catch is deliberate — one bad trip must not cost everyone
    // else their Digest — so a run that delivered is a working run. Gating on
    // `failed === 0` would pin the panel unhealthy forever on one
    // permanently-broken trip.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([sub("user-1", "Europe/Vienna")]);
    tripMemberFindManyMock.mockResolvedValue([
      { tripId: "trip-1" },
      { tripId: "trip-2" },
    ]);
    dispatchDigestMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ sent: 1, skipped: false });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(req({ secret: "right" }));

    expect(await res.json()).toMatchObject({ sent: 1, failed: 1 });
    expect(cronHeartbeatUpdateMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("does NOT stamp lastSuccessAt when every dispatch fails", async () => {
    // CD-06 through the other door. The per-trip catch swallows every throw,
    // so the run returns 200 having delivered nothing at all; stamping here
    // would report a totally broken dispatcher as healthy. Withholding the
    // stamp is what takes Account unhealthy after the 24h threshold.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([
      sub("user-1", "Europe/Vienna"),
      sub("user-2", "Europe/Vienna"),
    ]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);
    dispatchDigestMock.mockRejectedValue(new Error("push service down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(req({ secret: "right" }));

    // The run itself still succeeds — the contained failure is the whole
    // point of the per-trip catch. Only the health signal is withheld.
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 0, failed: 2 });
    expect(cronHeartbeatUpdateMock).not.toHaveBeenCalled();
    // lastRunAt still marches on: the scheduler did run. That is precisely
    // why it cannot be the only signal.
    expect(cronHeartbeatUpsertMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

describe("GET /api/cron/digest — slot dispatch", () => {
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
      zone: "Europe/Vienna",
    });
    expect(await res.json()).toEqual({
      considered: 1,
      dispatched: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
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
    // One instant, two zones, two different answers — the assertion that would
    // fail if the route used UTC anywhere. At 20:00Z, Sydney (UTC+11 in
    // December) is already 07:00 on the NEXT day, so the Sydney traveller gets
    // a MORNING digest dated 2026-12-02; Vienna is at 21:00 on 2026-12-01, so
    // the same instant produces the OTHER slot on the PREVIOUS date. Slot and
    // date both have to be read per-zone for this to hold.
    vi.setSystemTime(new Date("2026-12-01T20:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([
      sub("user-syd", "Australia/Sydney"),
      sub("user-vie", "Europe/Vienna"),
    ]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);

    const res = await GET(req({ secret: "right" }));

    expect(dispatchDigestMock).toHaveBeenCalledTimes(2);
    expect(dispatchDigestMock).toHaveBeenCalledWith({
      userId: "user-syd",
      tripId: "trip-1",
      localDate: "2026-12-02",
      slot: "MORNING",
      zone: "Australia/Sydney",
    });
    expect(dispatchDigestMock).toHaveBeenCalledWith({
      userId: "user-vie",
      tripId: "trip-1",
      localDate: "2026-12-01",
      slot: "EVENING",
      zone: "Europe/Vienna",
    });
    expect(await res.json()).toEqual({
      considered: 2,
      dispatched: 2,
      sent: 2,
      skipped: 0,
      failed: 0,
    });
  });

  it("skips a subscriber whose local hour is in neither window", async () => {
    // 12:00Z is 13:00 in Vienna — no slot.
    vi.setSystemTime(new Date("2026-12-01T12:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([sub("user-1", "Europe/Vienna")]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);

    const res = await GET(req({ secret: "right" }));

    expect(dispatchDigestMock).not.toHaveBeenCalled();
    // Not even the trip lookup runs for a subscriber outside both windows.
    expect(tripMemberFindManyMock).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      considered: 1,
      dispatched: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    });
  });

  // The windows are three hours wide so a GitHub Actions run delayed past its
  // scheduled hour still finds its subscribers. These pin both the width and
  // the edges: an hour past the window is still a skip, not a late send.
  it.each([
    { utc: "2026-12-01T21:00:00.000Z", localHour: "22:00", slot: "EVENING" },
    { utc: "2026-12-01T19:00:00.000Z", localHour: "20:00", slot: "EVENING" },
    { utc: "2026-12-01T05:00:00.000Z", localHour: "06:00", slot: "MORNING" },
    { utc: "2026-12-01T07:00:00.000Z", localHour: "08:00", slot: "MORNING" },
  ])(
    "dispatches $slot to a subscriber at local $localHour (delayed-run window)",
    async ({ utc, slot }) => {
      vi.setSystemTime(new Date(utc));
      pushFindManyMock.mockResolvedValue([sub("user-1", "Europe/Vienna")]);
      tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);

      await GET(req({ secret: "right" }));

      expect(dispatchDigestMock).toHaveBeenCalledTimes(1);
      expect(dispatchDigestMock).toHaveBeenCalledWith(
        expect.objectContaining({ slot }),
      );
    },
  );

  it.each([
    { utc: "2026-12-01T22:00:00.000Z", localHour: "23:00" },
    { utc: "2026-12-01T08:00:00.000Z", localHour: "09:00" },
    { utc: "2026-12-01T04:00:00.000Z", localHour: "05:00" },
    { utc: "2026-12-01T18:00:00.000Z", localHour: "19:00" },
  ])(
    "still skips a subscriber at local $localHour, one hour outside the window",
    async ({ utc }) => {
      vi.setSystemTime(new Date(utc));
      pushFindManyMock.mockResolvedValue([sub("user-1", "Europe/Vienna")]);
      tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);

      await GET(req({ secret: "right" }));

      expect(dispatchDigestMock).not.toHaveBeenCalled();
    },
  );

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
    // The query itself asks only for rows that can be scheduled, and is
    // bounded so one pathological run cannot be unbounded work.
    expect(pushFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { timezone: { not: null } },
        select: { userId: true, timezone: true, lastSeenAt: true },
        take: 2000,
      }),
    );
  });

  it("warns when the subscriber scan hits its cap, so truncation is not silent", async () => {
    vi.setSystemTime(new Date("2026-12-01T12:00:00.000Z"));
    pushFindManyMock.mockResolvedValue(
      Array.from({ length: 2000 }, (_, i) => sub(`user-${i}`, "Europe/Vienna")),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await GET(req({ secret: "right" }));

    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("2000-row cap"),
    );
    warnSpy.mockRestore();
  });

  it("does not warn when the scan comes back under the cap", async () => {
    vi.setSystemTime(new Date("2026-12-01T12:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([sub("user-1", "Europe/Vienna")]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await GET(req({ secret: "right" }));

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
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
      failed: 0,
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
      failed: 0,
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
      failed: 0,
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

  it("keeps going for the next subscriber when one dispatch throws, and counts it as failed", async () => {
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([
      sub("user-1", "Europe/Vienna"),
      sub("user-2", "Europe/Vienna"),
    ]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);
    dispatchDigestMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ sent: 1, skipped: false });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(req({ secret: "right" }));

    // The run survives: user-2 is still dispatched to. Without the per-trip
    // catch, one bad trip would cost every later subscriber their Digest —
    // and they get no retry, because eligibility is by local hour.
    expect(res.status).toBe(200);
    expect(dispatchDigestMock).toHaveBeenCalledTimes(2);
    expect(dispatchDigestMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: "user-2" }),
    );
    expect(await res.json()).toEqual({
      considered: 2,
      dispatched: 1,
      sent: 1,
      skipped: 0,
      failed: 1,
    });
    // The failure is logged with enough to find it — a burnt ledger slot is
    // invisible otherwise.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("user-1"),
      expect.any(Error),
    );
    expect(errorSpy.mock.calls[0][0]).toContain("trip-1");
    // ARCH-OBS-1: the sink is wired ALONGSIDE this console.error, not instead
    // of it — the per-user/per-trip text above is load-bearing (a burnt
    // ledger slot needs the specific subscriber to find it), which a deduped
    // ErrorReport signature deliberately cannot carry without exploding into
    // one row per (user, trip). Both channels fire.
    expect(reportErrorMock).toHaveBeenCalledWith(expect.any(Error), {
      route: "/api/cron/digest",
      source: "server",
      userId: "user-1",
    });
    errorSpy.mockRestore();
  });

  it("keeps going for a user's next trip when one of their trips throws", async () => {
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([sub("user-1", "Europe/Vienna")]);
    tripMemberFindManyMock.mockResolvedValue([
      { tripId: "trip-1" },
      { tripId: "trip-2" },
    ]);
    dispatchDigestMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ sent: 2, skipped: false });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(req({ secret: "right" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      considered: 1,
      dispatched: 1,
      sent: 2,
      skipped: 0,
      failed: 1,
    });
    errorSpy.mockRestore();
  });

  it("reports partial counts and 500 when the run itself fails", async () => {
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([
      sub("user-1", "Europe/Vienna"),
      sub("user-2", "Europe/Vienna"),
    ]);
    // The per-trip catch contains dispatch failures; the outer catch still
    // owns everything else — here the trip lookup dies on the second user.
    tripMemberFindManyMock
      .mockResolvedValueOnce([{ tripId: "trip-1" }])
      .mockRejectedValueOnce(new Error("connection lost"));

    const res = await GET(req({ secret: "right" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Internal server error",
      considered: 2,
      dispatched: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
    // ARCH-OBS-1: the whole-run failure is the highest-value site in this
    // route — this is the one case where the per-trip catch could not
    // contain the failure.
    expect(reportErrorMock).toHaveBeenCalledWith(expect.any(Error), {
      route: "/api/cron/digest",
      source: "server",
    });
  });

  it("uses the most recently seen device's zone and dispatches once per person", async () => {
    // A laptop left at home in Brisbane and a phone carried to Munich. Brisbane
    // reaches 8pm ~9h before Munich; before this fix the Brisbane cohort claimed
    // the slot and pushed to BOTH devices, so the phone buzzed at 11am Munich.
    // 19:00Z is 20:00 in Europe/Berlin (UTC+1 in December) — the elected zone's
    // own evening window, so the single dispatch below can only be reached by
    // resolving to Berlin, not by Brisbane's slot match (Brisbane is 05:00 next
    // day at this instant — outside both windows).
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([
      { userId: "u1", timezone: "Australia/Brisbane", lastSeenAt: new Date("2026-12-01T00:00:00Z") },
      { userId: "u1", timezone: "Europe/Berlin", lastSeenAt: new Date("2026-12-01T18:00:00Z") },
    ]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);
    dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false });

    const res = await GET(req({ secret: "right" }));

    expect(dispatchDigestMock).toHaveBeenCalledTimes(1);
    expect(dispatchDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", zone: "Europe/Berlin" }),
    );
    expect((await res.json()).considered).toBe(1);
  });

  it("ignores a device with no stored zone when picking the person's clock", async () => {
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    pushFindManyMock.mockResolvedValue([
      { userId: "u1", timezone: null, lastSeenAt: new Date("2026-12-01T19:00:00Z") },
      { userId: "u1", timezone: "Europe/Berlin", lastSeenAt: new Date("2026-12-01T18:00:00Z") },
    ]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);
    dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false });

    await GET(req({ secret: "right" }));

    expect(dispatchDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({ zone: "Europe/Berlin" }),
    );
  });

  it("keeps the first row's zone when two Devices share a lastSeenAt to the millisecond", async () => {
    // The tie-break is `>`, strictly: on an exact tie the first row the scan
    // returned keeps its spot. That is a deterministic pick, not a
    // correct-by-clock one — an identical lastSeenAt gives no real signal —
    // and it is only deterministic if nothing later re-elects. Both zones
    // below are UTC+1 in December, so 19:00Z is 20:00 local for either: the
    // dispatch happens whichever wins, and only the `zone` argument says which.
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    const tie = new Date("2026-12-01T18:00:00Z");
    pushFindManyMock.mockResolvedValue([
      { userId: "u1", timezone: "Europe/Berlin", lastSeenAt: tie },
      { userId: "u1", timezone: "Europe/Paris", lastSeenAt: tie },
    ]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);
    dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false });

    await GET(req({ secret: "right" }));

    expect(dispatchDigestMock).toHaveBeenCalledTimes(1);
    expect(dispatchDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", zone: "Europe/Berlin" }),
    );
  });
});
