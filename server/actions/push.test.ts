import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  reportErrorMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn().mockResolvedValue({ id: "user-1" }),
  pushSubUpsertMock: vi.fn(),
  pushSubDeleteManyMock: vi.fn(),
  pushSubFindUniqueMock: vi.fn(),
  pushSubUpdateMock: vi.fn(),
  reportErrorMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/guards", () => ({
  requireUser: requireUserMock,
}));

// ARCH-OBS-1: these catches report to the error sink. Mocked entirely here
// — reportError's own behaviour is lib/error-sink.test.ts's job.
vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));

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

  it("logs the error rather than swallowing it when the db throws", async () => {
    // CD-09: three bare `catch {` blocks meant every failure in this file was
    // invisible — the caller got a generic message and the operator got
    // nothing at all.
    const boom = new Error("connection reset");
    pushSubUpsertMock.mockRejectedValue(boom);

    const result = await subscribeToPush(STUB_SUB);

    expect(result).toEqual({ ok: false, error: "Failed to save push subscription." });
    // ARCH-OBS-1 (was: expect(errorSpy).toHaveBeenCalledWith(...))
    expect(reportErrorMock).toHaveBeenCalledWith(boom, {
      route: "server/actions/push.ts#subscribeToPush",
      source: "server",
    });
  });

  it("writes the same key material on the create and update arms", async () => {
    pushSubUpsertMock.mockResolvedValue({});

    await subscribeToPush({ ...STUB_SUB, timezone: "Europe/Berlin" });

    const call = pushSubUpsertMock.mock.calls[0][0];
    const core = { p256dh: "stub-p256dh", auth: "stub-auth", timezone: "Europe/Berlin" };
    expect(call.create).toMatchObject(core);
    expect(call.update).toMatchObject(core);
  });

  // ADR 0053: a PushSubscription row is never reassigned to a different
  // user. `mockResolvedValueOnce` (rather than `mockResolvedValue`) on
  // `requireUserMock` and `pushSubFindUniqueMock` here so neither leaks past
  // its own test — `clearAllMocks()` (top-level afterEach) does not clear a
  // persistent `mockResolvedValue`, which would otherwise poison the
  // `requireUserMock` default (`{ id: "user-1" }`) the unsubscribeFromPush
  // and healRotatedSubscription describes below assume.
  it("refuses to take over a subscription owned by someone else", async () => {
    requireUserMock.mockResolvedValueOnce({ id: "u2", email: "b@example.com" });
    pushSubFindUniqueMock.mockResolvedValueOnce({
      userId: "u1",
    });

    const result = await subscribeToPush({
      endpoint: "https://push.example/abc",
      keys: { p256dh: "p", auth: "a" },
    });

    expect(result).toEqual({
      ok: false,
      error:
        "This device is already enabled for another account. Turn it off there, or press Enable again.",
      reason: "conflict",
    });
    expect(pushSubUpsertMock).not.toHaveBeenCalled();
  });

  it("still updates a subscription the caller already owns", async () => {
    requireUserMock.mockResolvedValueOnce({ id: "u1", email: "a@example.com" });
    pushSubFindUniqueMock.mockResolvedValueOnce({ userId: "u1" });
    pushSubUpsertMock.mockResolvedValue({});

    const result = await subscribeToPush({
      endpoint: "https://push.example/abc",
      keys: { p256dh: "p", auth: "a" },
    });

    expect(result).toEqual({ ok: true });
    expect(pushSubUpsertMock).toHaveBeenCalled();
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

  it("logs the error rather than swallowing it when the db throws", async () => {
    const boom = new Error("connection reset");
    pushSubDeleteManyMock.mockRejectedValue(boom);

    const result = await unsubscribeFromPush(STUB_SUB.endpoint);

    expect(result).toEqual({ ok: false, error: "Failed to remove push subscription." });
    // ARCH-OBS-1 (was: expect(errorSpy).toHaveBeenCalledWith(...))
    expect(reportErrorMock).toHaveBeenCalledWith(boom, {
      route: "server/actions/push.ts#unsubscribeFromPush",
      source: "server",
    });
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
  // `vi.clearAllMocks()` (top-level afterEach) clears call history but not a
  // persistent `mockResolvedValue`/`mockImplementation` — the same gotcha
  // documented in devices.test.ts. This function can call `findUnique` twice
  // in one invocation (old endpoint, then new endpoint), so every test resets
  // it explicitly rather than relying on the previous test's leftovers.
  beforeEach(() => {
    pushSubFindUniqueMock.mockReset();
    pushSubUpdateMock.mockReset();
    pushSubUpsertMock.mockReset();
  });

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
    // `lastSeenAt` must NOT be bumped here: this heal runs from a background
    // `pushsubscriptionchange`, not app usage, and ADR 0050's zone election
    // (app/api/cron/digest/route.ts) reads `lastSeenAt` as "last used the
    // app". Bumping it on a rotation would let a stale, unused Device re-win
    // that election on a background event nobody was present for.
    expect(pushSubUpdateMock.mock.calls[0][0].data).not.toHaveProperty("lastSeenAt");
  });

  it("refuses to touch another traveller's row and registers the new one instead", async () => {
    // Two different `findUnique` calls happen in this path: the old endpoint
    // (owned by someone else, so it falls through) and then the new endpoint
    // (nobody's row yet, so the register can proceed).
    pushSubFindUniqueMock.mockImplementation(
      async ({ where }: { where: { endpoint: string } }) =>
        where.endpoint === "https://old"
          ? { id: "row-1", userId: "someone-else", endpoint: "https://old" }
          : null,
    );
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

    expect(res).toEqual({
      ok: false,
      error: "No usable key material.",
      reason: "invalid",
    });
    expect(pushSubUpsertMock).not.toHaveBeenCalled();
    expect(pushSubUpdateMock).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    pushSubUpsertMock.mockResolvedValue({ id: "row-2" });

    await healRotatedSubscription({
      endpoint: "https://new",
      keys: { p256dh: "newp", auth: "newa" },
    });

    expect(requireUserMock).toHaveBeenCalled();
  });

  // The critical case: an authenticated caller posts a victim's own live
  // endpoint as the NEW endpoint (no matching old endpoint), trying to walk
  // straight into the register path and take the row over. This must be
  // refused exactly like the old-endpoint hijack is.
  it("refuses to reassign a row at the new endpoint that belongs to another traveller", async () => {
    pushSubFindUniqueMock.mockResolvedValue({
      id: "row-2",
      userId: "someone-else",
      endpoint: "https://new",
    });

    const res = await healRotatedSubscription({
      endpoint: "https://new",
      keys: { p256dh: "newp", auth: "newa" },
    });

    expect(res).toEqual({
      ok: false,
      error: "That endpoint belongs to another traveller.",
      reason: "forbidden",
    });
    expect(pushSubUpsertMock).not.toHaveBeenCalled();
  });

  // The route (app/api/push/route.ts) maps this reason to a 500, not a 400 —
  // an unexpected DB failure is TEEPEE's fault, not the caller's, and must
  // not be reported as a client error.
  it("returns reason: internal when the database throws", async () => {
    const boom = new Error("DB error");
    pushSubUpsertMock.mockRejectedValue(boom);

    const res = await healRotatedSubscription({
      endpoint: "https://new",
      keys: { p256dh: "newp", auth: "newa" },
    });

    expect(res).toEqual({
      ok: false,
      error: "Failed to heal push subscription.",
      reason: "internal",
    });
    // ARCH-OBS-1 (was: expect(errorSpy).toHaveBeenCalledWith(...))
    expect(reportErrorMock).toHaveBeenCalledWith(boom, {
      route: "server/actions/push.ts#healRotatedSubscription",
      source: "server",
    });
  });

  // The mirror of the case above: the refusal must not be so broad that it
  // blocks the ordinary path of a Traveller's own Device re-registering at an
  // endpoint it already owns.
  it("registers normally when the row at the new endpoint already belongs to the caller", async () => {
    pushSubFindUniqueMock.mockResolvedValue({
      id: "row-2",
      userId: "user-1",
      endpoint: "https://new",
    });
    pushSubUpsertMock.mockResolvedValue({ id: "row-2" });

    const res = await healRotatedSubscription({
      endpoint: "https://new",
      keys: { p256dh: "newp", auth: "newa" },
    });

    expect(res).toEqual({ ok: true, mode: "registered" });
    expect(pushSubUpsertMock).toHaveBeenCalled();
  });

  // Same reasoning as the old-endpoint case above, but for the upsert's
  // `update` arm (a row already exists at the NEW endpoint and belongs to the
  // caller). The `create` arm is intentionally exempt — a brand-new row has
  // no stale `lastSeenAt` to protect and, once it carries a real timezone,
  // SHOULD win the ADR 0050 election.
  it("does not bump lastSeenAt on the upsert's update arm, but does on create", async () => {
    pushSubFindUniqueMock.mockResolvedValue(null);
    pushSubUpsertMock.mockResolvedValue({ id: "row-2" });

    await healRotatedSubscription({
      endpoint: "https://new",
      keys: { p256dh: "newp", auth: "newa" },
    });

    const arg = pushSubUpsertMock.mock.calls[0][0];
    expect(arg.create).toHaveProperty("lastSeenAt");
    expect(arg.update).not.toHaveProperty("lastSeenAt");
  });
});
