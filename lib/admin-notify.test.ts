import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for notifyAdmins (lib/admin-notify.ts).
 *
 * `sendPush` is a spy, but the real `buildDigestPayload` runs (same pattern
 * as lib/digest-dispatch.test.ts) so the JSON payload a Device would receive
 * is asserted end to end. This must never throw, regardless of what's
 * missing — no admin, no Device, no VAPID config, a rejecting query, a
 * rejecting or stalling sendPush call — because it is called from the
 * sign-in path and from error-reporting paths, none of which may fail (or
 * hang) because a push notice couldn't be delivered.
 */

const {
  userFindManyMock,
  pushSubscriptionFindManyMock,
  pushSubscriptionDeleteManyMock,
  sendPushMock,
} = vi.hoisted(() => ({
  userFindManyMock: vi.fn(),
  pushSubscriptionFindManyMock: vi.fn(),
  pushSubscriptionDeleteManyMock: vi.fn(),
  sendPushMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findMany: userFindManyMock },
    pushSubscription: {
      findMany: pushSubscriptionFindManyMock,
      deleteMany: pushSubscriptionDeleteManyMock,
    },
  },
}));

vi.mock("@/lib/push", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/push")>();
  return { ...actual, sendPush: sendPushMock };
});

import { notifyAdmins } from "./admin-notify";

const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

afterEach(() => {
  vi.clearAllMocks();
  if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
});

describe("notifyAdmins", () => {
  it("does nothing, without throwing, when ADMIN_EMAILS is unset", async () => {
    delete process.env.ADMIN_EMAILS;
    await expect(notifyAdmins("t", "b", "/u")).resolves.toBeUndefined();
    expect(userFindManyMock).not.toHaveBeenCalled();
  });

  it("does nothing, without throwing, when no admin User row exists", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    userFindManyMock.mockResolvedValue([]);
    await expect(notifyAdmins("t", "b", "/u")).resolves.toBeUndefined();
    expect(pushSubscriptionFindManyMock).not.toHaveBeenCalled();
  });

  it("does nothing, without throwing, when the admin has no Device", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    userFindManyMock.mockResolvedValue([{ id: "u1" }]);
    pushSubscriptionFindManyMock.mockResolvedValue([]);
    await expect(notifyAdmins("t", "b", "/u")).resolves.toBeUndefined();
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("sends the given title/body/url to every admin Device", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    userFindManyMock.mockResolvedValue([{ id: "u1" }]);
    pushSubscriptionFindManyMock.mockResolvedValue([
      { id: "sub1", endpoint: "https://push/1", p256dh: "p1", auth: "a1" },
      { id: "sub2", endpoint: "https://push/2", p256dh: "p2", auth: "a2" },
    ]);
    sendPushMock.mockResolvedValue({ sent: true });

    await notifyAdmins("New Access request", "someone asked to join", "/admin");

    expect(sendPushMock).toHaveBeenCalledTimes(2);
    const [sub, payload] = sendPushMock.mock.calls[0];
    expect(sub).toEqual({ endpoint: "https://push/1", p256dh: "p1", auth: "a1" });
    expect(JSON.parse(payload)).toEqual({
      title: "New Access request",
      body: "someone asked to join",
      url: "/admin",
    });
  });

  it("never throws when VAPID is unconfigured (sendPush returns skipped)", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    userFindManyMock.mockResolvedValue([{ id: "u1" }]);
    pushSubscriptionFindManyMock.mockResolvedValue([
      { id: "sub1", endpoint: "https://push/1", p256dh: "p1", auth: "a1" },
    ]);
    sendPushMock.mockResolvedValue({ sent: false, skipped: true });
    await expect(notifyAdmins("t", "b", "/u")).resolves.toBeUndefined();
  });

  it("never throws when the admin lookup rejects", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    userFindManyMock.mockRejectedValue(new Error("db down"));
    await expect(notifyAdmins("t", "b", "/u")).resolves.toBeUndefined();
  });

  it("never throws when sendPush itself rejects", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    userFindManyMock.mockResolvedValue([{ id: "u1" }]);
    pushSubscriptionFindManyMock.mockResolvedValue([
      { id: "sub1", endpoint: "https://push/1", p256dh: "p1", auth: "a1" },
    ]);
    sendPushMock.mockRejectedValue(new Error("push exploded"));
    await expect(notifyAdmins("t", "b", "/u")).resolves.toBeUndefined();
  });

  it("logs a rejecting sendPush call instead of discarding it silently (carry-forward, Task 16)", async () => {
    // A previous fix round replaced this arm's console.error with a bare
    // discard. That was tolerable when the only caller was an invite
    // notification; now notifyAdmins is the error sink's own delivery path
    // (lib/error-sink.ts), so a silently discarded push failure here means
    // errors are recorded and never surfaced — the hardest failure mode in
    // the whole system to notice.
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.ADMIN_EMAILS = "admin@example.com";
    userFindManyMock.mockResolvedValue([{ id: "u1" }]);
    pushSubscriptionFindManyMock.mockResolvedValue([
      { id: "sub1", endpoint: "https://push/1", p256dh: "p1", auth: "a1" },
    ]);
    const rejection = new Error("push exploded");
    sendPushMock.mockRejectedValue(rejection);

    await notifyAdmins("t", "b", "/u");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[admin-notify]"),
      rejection,
    );
    consoleErrorSpy.mockRestore();
  });

  it("parses ADMIN_EMAILS into a trimmed, lowercased, case-insensitive OR filter", async () => {
    // Corrected name (fix round 1, item 2): the previous version of this
    // test only proved the env var was parsed — it stubbed findMany to []
    // and never exercised a mixed-case STORED email, so it overclaimed
    // "case-insensitive" when only the needle side was lowercased. See the
    // next test for the actual matching guarantee.
    process.env.ADMIN_EMAILS = " Admin@Example.com , second@example.com ";
    userFindManyMock.mockResolvedValue([]);
    await notifyAdmins("t", "b", "/u");
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { email: { equals: "admin@example.com", mode: "insensitive" } },
            { email: { equals: "second@example.com", mode: "insensitive" } },
          ],
        },
      }),
    );
  });

  it("matches a stored admin User.email of different case than ADMIN_EMAILS (fix round 1, item 2)", async () => {
    // Postgres `IN` is case-sensitive; a lowercased ADMIN_EMAILS needle
    // matched with `in` against an un-normalised, provider-cased stored
    // email (PrismaAdapter writes it straight from the OAuth profile) would
    // silently return zero rows here. Drive the mock off the REAL where
    // shape our code sends — same style as lib/allowlist.test.ts's
    // hasPendingTripInvite P0 tests — so a regression back to `in` fails
    // this test rather than passing it by coincidence.
    process.env.ADMIN_EMAILS = "admin@example.com";
    const storedAdmin = { id: "u1", email: "Admin@Example.com" };
    userFindManyMock.mockImplementation(
      async ({ where }: { where: { OR: Array<{ email: { equals: string; mode: string } }> } }) => {
        const matches = where.OR.some(
          (clause) =>
            clause.email.mode === "insensitive" &&
            clause.email.equals.toLowerCase() === storedAdmin.email.toLowerCase(),
        );
        return matches ? [{ id: storedAdmin.id }] : [];
      },
    );
    pushSubscriptionFindManyMock.mockResolvedValue([]);

    await notifyAdmins("t", "b", "/u");

    expect(pushSubscriptionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: ["u1"] } } }),
    );
  });

  it("prunes a Device sendPush reports as permanently gone (404/410), leaving live ones alone", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    userFindManyMock.mockResolvedValue([{ id: "u1" }]);
    pushSubscriptionFindManyMock.mockResolvedValue([
      { id: "sub-stale", endpoint: "https://push/stale", p256dh: "p1", auth: "a1" },
      { id: "sub-live", endpoint: "https://push/live", p256dh: "p2", auth: "a2" },
    ]);
    sendPushMock.mockImplementation(
      async (sub: { endpoint: string }) =>
        sub.endpoint === "https://push/stale"
          ? { sent: false, gone: true }
          : { sent: true },
    );

    await notifyAdmins("t", "b", "/u");

    expect(pushSubscriptionDeleteManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["sub-stale"] } },
    });
  });

  it("does not prune anything when every send succeeds", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    userFindManyMock.mockResolvedValue([{ id: "u1" }]);
    pushSubscriptionFindManyMock.mockResolvedValue([
      { id: "sub-live", endpoint: "https://push/live", p256dh: "p2", auth: "a2" },
    ]);
    sendPushMock.mockResolvedValue({ sent: true });

    await notifyAdmins("t", "b", "/u");

    expect(pushSubscriptionDeleteManyMock).not.toHaveBeenCalled();
  });
});

describe("notifyAdmins — stalled push endpoints (fix round 1, item 3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves instead of hanging forever when a push endpoint never settles", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    userFindManyMock.mockResolvedValue([{ id: "u1" }]);
    pushSubscriptionFindManyMock.mockResolvedValue([
      { id: "sub1", endpoint: "https://push/stalled", p256dh: "p1", auth: "a1" },
    ]);
    // Simulates a push endpoint that never responds — no timeout on the
    // underlying HTTPS client (lib/push.ts), so without a bound here this
    // promise would never settle and the caller (lib/auth.ts's signIn
    // callback) would hang until the platform kills the function.
    sendPushMock.mockImplementation(() => new Promise(() => {}));

    const settled = vi.fn();
    void notifyAdmins("t", "b", "/u").then(settled);

    // Not settled before the timeout fires.
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).not.toHaveBeenCalled();

    // Settles once PUSH_TIMEOUT_MS has elapsed.
    await vi.advanceTimersByTimeAsync(2000);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("logs when a push endpoint times out instead of staying silent (carry-forward, Task 16)", async () => {
    // The timeout arm logged nothing at all before this. Same reasoning as
    // the rejection-arm test above: with notifyAdmins now the error sink's
    // delivery path, a push that silently times out means an error was
    // recorded and nobody was ever told.
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.ADMIN_EMAILS = "admin@example.com";
    userFindManyMock.mockResolvedValue([{ id: "u1" }]);
    pushSubscriptionFindManyMock.mockResolvedValue([
      { id: "sub1", endpoint: "https://push/stalled", p256dh: "p1", auth: "a1" },
    ]);
    sendPushMock.mockImplementation(() => new Promise(() => {}));

    const done = notifyAdmins("t", "b", "/u");
    await vi.advanceTimersByTimeAsync(3000);
    await done;

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("[admin-notify]"));
    consoleWarnSpy.mockRestore();
  });
});

describe("notifyAdmins — concurrency", () => {
  it("sends to every Device concurrently rather than one at a time", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    userFindManyMock.mockResolvedValue([{ id: "u1" }]);
    pushSubscriptionFindManyMock.mockResolvedValue([
      { id: "sub1", endpoint: "https://push/1", p256dh: "p1", auth: "a1" },
      { id: "sub2", endpoint: "https://push/2", p256dh: "p2", auth: "a2" },
    ]);

    let inFlight = 0;
    let maxInFlight = 0;
    sendPushMock.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Yield so a sequential (await-in-a-loop) implementation would have
      // already resolved this call before starting the next one.
      await Promise.resolve();
      await Promise.resolve();
      inFlight -= 1;
      return { sent: true };
    });

    await notifyAdmins("t", "b", "/u");

    expect(maxInFlight).toBe(2);
  });
});
