import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Fix round 1, C1: an end-to-end regression test for the
 * notifyAdmins -> sendPush -> reportError feedback loop.
 *
 * lib/admin-notify.test.ts mocks `sendPush` entirely (so it can assert the
 * *shape* of what notifyAdmins sends), and lib/push.test.ts proves sendPush
 * itself never reports when called with `{ report: false }` — but neither
 * proves the actual wiring between the two. This file runs the REAL
 * `sendPush` behind `notifyAdmins` (only the underlying `web-push` package,
 * `@/lib/db` and `@/lib/error-sink` are mocked) to prove the real call
 * chain never re-enters `reportError`.
 *
 * Uses dynamic imports after `vi.stubEnv` + `vi.resetModules()` (same
 * pattern as lib/push.test.ts): lib/push.ts reads its VAPID env vars once,
 * at module-evaluation time, so a static top-level import here would run
 * before any env stubbing in a test body could take effect.
 */

const {
  sendNotificationMock,
  setVapidDetailsMock,
  reportErrorMock,
  userFindManyMock,
  pushSubscriptionFindManyMock,
  pushSubscriptionDeleteManyMock,
} = vi.hoisted(() => ({
  sendNotificationMock: vi.fn(),
  setVapidDetailsMock: vi.fn(),
  reportErrorMock: vi.fn().mockResolvedValue(undefined),
  userFindManyMock: vi.fn(),
  pushSubscriptionFindManyMock: vi.fn(),
  pushSubscriptionDeleteManyMock: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: setVapidDetailsMock,
    sendNotification: sendNotificationMock,
  },
  setVapidDetails: setVapidDetailsMock,
  sendNotification: sendNotificationMock,
}));

vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findMany: userFindManyMock },
    pushSubscription: {
      findMany: pushSubscriptionFindManyMock,
      deleteMany: pushSubscriptionDeleteManyMock,
    },
  },
}));

const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
});

describe("notifyAdmins — the real sendPush chain never feeds back into the error sink (C1)", () => {
  it("a sendPush failure inside notifyAdmins produces no further reportError call", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
    process.env.ADMIN_EMAILS = "admin@example.com";
    userFindManyMock.mockResolvedValue([{ id: "u1" }]);
    pushSubscriptionFindManyMock.mockResolvedValue([
      { id: "sub1", endpoint: "https://push/1", p256dh: "p1", auth: "a1" },
    ]);
    // A realistic push failure: a rejection whose message embeds a
    // resolved address, exactly the kind that would NOT dedup to a stable
    // signature across attempts if it ever reached reportError.
    sendNotificationMock.mockRejectedValue(new Error("connect ETIMEDOUT 142.250.185.10:443"));

    vi.resetModules();
    const { notifyAdmins } = await import("./admin-notify");

    await notifyAdmins("t", "b", "/u");

    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("an ordinary (non-notifyAdmins) sendPush failure still reports — the loop guard is targeted, not global", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
    sendNotificationMock.mockRejectedValue(new Error("Network error"));

    vi.resetModules();
    const { sendPush } = await import("./push");

    await sendPush(
      { endpoint: "https://push/1", p256dh: "p1", auth: "a1" },
      JSON.stringify({ title: "t", body: "b", url: "/u" }),
    );

    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });
});
