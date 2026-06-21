import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for push server actions.
 *
 * Mocks: lib/db, lib/guards
 */

const {
  requireUserMock,
  pushSubUpsertMock,
  pushSubDeleteManyMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn().mockResolvedValue({ id: "user-1" }),
  pushSubUpsertMock: vi.fn(),
  pushSubDeleteManyMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireUser: requireUserMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    pushSubscription: {
      upsert: pushSubUpsertMock,
      deleteMany: pushSubDeleteManyMock,
    },
  },
}));

import { subscribeToPush, unsubscribeFromPush } from "@/server/actions/push";

const STUB_SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/stub",
  keys: { p256dh: "stub-p256dh", auth: "stub-auth" },
};

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// subscribeToPush
// ---------------------------------------------------------------------------

describe("subscribeToPush", () => {
  it("upserts the subscription and returns { ok: true }", async () => {
    pushSubUpsertMock.mockResolvedValue({});

    const result = await subscribeToPush(STUB_SUB);

    expect(result).toEqual({ ok: true });
    expect(requireUserMock).toHaveBeenCalled();
    expect(pushSubUpsertMock).toHaveBeenCalledWith({
      where: { endpoint: STUB_SUB.endpoint },
      create: {
        userId: "user-1",
        endpoint: STUB_SUB.endpoint,
        p256dh: STUB_SUB.keys.p256dh,
        auth: STUB_SUB.keys.auth,
      },
      update: {
        userId: "user-1",
        p256dh: STUB_SUB.keys.p256dh,
        auth: STUB_SUB.keys.auth,
      },
    });
  });

  it("returns { ok: false } when db throws", async () => {
    pushSubUpsertMock.mockRejectedValue(new Error("DB error"));

    const result = await subscribeToPush(STUB_SUB);

    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toBeDefined();
  });

  it("requires authentication", async () => {
    pushSubUpsertMock.mockResolvedValue({});
    await subscribeToPush(STUB_SUB);
    expect(requireUserMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// unsubscribeFromPush
// ---------------------------------------------------------------------------

describe("unsubscribeFromPush", () => {
  it("deletes the subscription by endpoint + userId and returns { ok: true }", async () => {
    pushSubDeleteManyMock.mockResolvedValue({ count: 1 });

    const result = await unsubscribeFromPush(STUB_SUB.endpoint);

    expect(result).toEqual({ ok: true });
    expect(pushSubDeleteManyMock).toHaveBeenCalledWith({
      where: { endpoint: STUB_SUB.endpoint, userId: "user-1" },
    });
  });

  it("returns { ok: true } even if no rows matched (already gone)", async () => {
    pushSubDeleteManyMock.mockResolvedValue({ count: 0 });

    const result = await unsubscribeFromPush(STUB_SUB.endpoint);

    expect(result).toEqual({ ok: true });
  });

  it("returns { ok: false } when db throws", async () => {
    pushSubDeleteManyMock.mockRejectedValue(new Error("DB error"));

    const result = await unsubscribeFromPush(STUB_SUB.endpoint);

    expect(result).toMatchObject({ ok: false });
  });

  it("scopes deletion to current user (cannot delete another user's subscription)", async () => {
    pushSubDeleteManyMock.mockResolvedValue({ count: 0 });

    await unsubscribeFromPush(STUB_SUB.endpoint);

    const call = pushSubDeleteManyMock.mock.calls[0][0];
    expect(call.where.userId).toBe("user-1");
  });
});
