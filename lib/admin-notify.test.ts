import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for notifyAdmins (lib/admin-notify.ts).
 *
 * `sendPush` is a spy, but the real `buildDigestPayload` runs (same pattern
 * as lib/digest-dispatch.test.ts) so the JSON payload a Device would receive
 * is asserted end to end. This must never throw, regardless of what's
 * missing — no admin, no Device, no VAPID config, a rejecting query, a
 * rejecting sendPush call — because it is called from the sign-in path and
 * from error-reporting paths, none of which may fail because a push notice
 * couldn't be delivered.
 */

const { userFindManyMock, pushSubscriptionFindManyMock, sendPushMock } = vi.hoisted(() => ({
  userFindManyMock: vi.fn(),
  pushSubscriptionFindManyMock: vi.fn(),
  sendPushMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findMany: userFindManyMock },
    pushSubscription: { findMany: pushSubscriptionFindManyMock },
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
      { endpoint: "https://push/1", p256dh: "p1", auth: "a1" },
      { endpoint: "https://push/2", p256dh: "p2", auth: "a2" },
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
      { endpoint: "https://push/1", p256dh: "p1", auth: "a1" },
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
      { endpoint: "https://push/1", p256dh: "p1", auth: "a1" },
    ]);
    sendPushMock.mockRejectedValue(new Error("push exploded"));
    await expect(notifyAdmins("t", "b", "/u")).resolves.toBeUndefined();
  });

  it("resolves admins by ADMIN_EMAILS, case- and space-insensitively", async () => {
    process.env.ADMIN_EMAILS = " Admin@Example.com , second@example.com ";
    userFindManyMock.mockResolvedValue([]);
    await notifyAdmins("t", "b", "/u");
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { in: ["admin@example.com", "second@example.com"] } },
      }),
    );
  });
});
