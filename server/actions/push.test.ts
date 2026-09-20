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
  pushSubFindUniqueMock,
  pushSubUpdateMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn().mockResolvedValue({ id: "user-1" }),
  pushSubUpsertMock: vi.fn(),
  pushSubDeleteManyMock: vi.fn(),
  pushSubFindUniqueMock: vi.fn(),
  pushSubUpdateMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireUser: requireUserMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    pushSubscription: {
      upsert: pushSubUpsertMock,
      deleteMany: pushSubDeleteManyMock,
      findUnique: pushSubFindUniqueMock,
      update: pushSubUpdateMock,
    },
  },
}));

import {
  healRotatedSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/server/actions/push";

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
        label: null,
        lastSeenAt: expect.any(Date),
      },
      update: {
        userId: "user-1",
        p256dh: STUB_SUB.keys.p256dh,
        auth: STUB_SUB.keys.auth,
        lastSeenAt: expect.any(Date),
      },
    });
  });

  it("derives the label from the user agent on create only", async () => {
    pushSubUpsertMock.mockResolvedValue({});

    await subscribeToPush({
      ...STUB_SUB,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15",
    });

    const arg = pushSubUpsertMock.mock.calls[0][0];
    expect(arg.create.label).toBe("iPhone");
    expect(arg.update).not.toHaveProperty("label");
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

  it("stores the device timezone on create and update", async () => {
    pushSubUpsertMock.mockResolvedValue({});

    await subscribeToPush({
      endpoint: "https://push.example/1",
      keys: { p256dh: "p", auth: "a" },
      timezone: "Australia/Sydney",
    });

    expect(pushSubUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ timezone: "Australia/Sydney" }),
        update: expect.objectContaining({ timezone: "Australia/Sydney" }),
      }),
    );
  });

  it("omits the timezone when the client did not send one", async () => {
    pushSubUpsertMock.mockResolvedValue({});

    await subscribeToPush({
      endpoint: "https://push.example/1",
      keys: { p256dh: "p", auth: "a" },
    });

    const arg = pushSubUpsertMock.mock.calls[0][0];
    expect(arg.create.timezone).toBeUndefined();
    expect(arg.update.timezone).toBeUndefined();
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

// ---------------------------------------------------------------------------
// healRotatedSubscription
// ---------------------------------------------------------------------------

describe("healRotatedSubscription", () => {
  it("updates the rotated row in place, preserving label, timezone and createdAt", async () => {
    pushSubFindUniqueMock.mockResolvedValue({
      id: "row-1",
      userId: "user-1",
      endpoint: "https://old",
      p256dh: "oldp",
      auth: "olda",
      label: "iPhone · Safari",
      timezone: "Europe/Berlin",
    });
    pushSubUpdateMock.mockResolvedValue({ id: "row-1" });

    const res = await healRotatedSubscription({
      oldEndpoint: "https://old",
      endpoint: "https://new",
      keys: { p256dh: "newp", auth: "newa" },
    });

    expect(res).toEqual({ ok: true, mode: "updated" });
    expect(pushSubUpdateMock).toHaveBeenCalledWith({
      where: { endpoint: "https://old" },
      data: expect.objectContaining({
        endpoint: "https://new",
        p256dh: "newp",
        auth: "newa",
      }),
    });
    // label is captured once and never re-derived (ADR 0048)
    expect(pushSubUpdateMock.mock.calls[0][0].data).not.toHaveProperty("label");
  });

  it("refuses to touch another traveller's row and registers the new one instead", async () => {
    pushSubFindUniqueMock.mockResolvedValue({
      id: "row-1",
      userId: "someone-else",
      endpoint: "https://old",
    });
    pushSubUpsertMock.mockResolvedValue({ id: "row-2" });

    const res = await healRotatedSubscription({
      oldEndpoint: "https://old",
      endpoint: "https://new",
      keys: { p256dh: "newp", auth: "newa" },
    });

    expect(res).toEqual({ ok: true, mode: "registered" });
    expect(pushSubUpdateMock).not.toHaveBeenCalled();
  });

  it("registers the new subscription and leaves the old row standing when the old endpoint is unknown", async () => {
    pushSubUpsertMock.mockResolvedValue({ id: "row-2" });

    const res = await healRotatedSubscription({
      endpoint: "https://new",
      keys: { p256dh: "newp", auth: "newa" },
    });

    expect(res).toEqual({ ok: true, mode: "registered" });
    expect(pushSubDeleteManyMock).not.toHaveBeenCalled();
  });

  it("refuses empty key material rather than creating a device that cannot receive", async () => {
    const res = await healRotatedSubscription({
      endpoint: "https://new",
      keys: { p256dh: "", auth: "" },
    });

    expect(res).toEqual({ ok: false, error: "No usable key material." });
    expect(pushSubUpsertMock).not.toHaveBeenCalled();
    expect(pushSubUpdateMock).not.toHaveBeenCalled();
  });
});
