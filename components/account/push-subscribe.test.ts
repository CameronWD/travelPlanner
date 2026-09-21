import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for `subscribeThisDevice` — the client half of ADR 0053.
 *
 * The server half (a PushSubscription row is never reassigned) is covered in
 * `server/actions/push.test.ts`. This file covers the browser's answer to a
 * refusal: unsubscribe, re-subscribe to mint a *fresh* endpoint, retry once.
 * That retry is what keeps a shared computer working after the server stopped
 * re-pointing rows, so a regression in it re-breaks the case ADR 0053 went out
 * of its way to preserve — and it had no automated coverage at all.
 *
 * `VAPID_PUBLIC_KEY` is read at module scope in the file under test, so the
 * env var is set in a `vi.hoisted` block: that runs before the static import
 * below is evaluated, which `beforeEach` would not. The value only has to
 * survive `atob`, since `pushManager.subscribe` is stubbed.
 */

const { subscribeToPushMock } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BFAKEKEY";
  return { subscribeToPushMock: vi.fn() };
});

vi.mock("@/server/actions/push", () => ({ subscribeToPush: subscribeToPushMock }));
vi.mock("@/lib/tz", () => ({ deviceTimeZone: () => "Australia/Brisbane" }));

import { subscribeThisDevice } from "@/components/account/push-subscribe";

const unsubscribeMock = vi.fn().mockResolvedValue(true);
const subscribeMock = vi.fn();
const requestPermissionMock = vi.fn();

/** A browser PushSubscription, as `persistSubscription` reads one. */
function subscription(endpoint: string) {
  return {
    endpoint,
    toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: unsubscribeMock,
  };
}

/** The endpoints `subscribeToPush` was handed, in call order. */
function endpointsSent(): string[] {
  return subscribeToPushMock.mock.calls.map((call) => call[0].endpoint);
}

beforeEach(() => {
  requestPermissionMock.mockResolvedValue("granted");
  // @ts-expect-error — test stub for a browser global jsdom does not provide
  window.Notification = { requestPermission: requestPermissionMock };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager: { subscribe: subscribeMock } }) },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  unsubscribeMock.mockResolvedValue(true);
  vi.unstubAllEnvs();
});

describe("subscribeThisDevice", () => {
  it("persists the subscription it minted and reports success", async () => {
    subscribeMock.mockResolvedValue(subscription("https://push.example/AAA"));
    subscribeToPushMock.mockResolvedValue({ ok: true });

    const result = await subscribeThisDevice();

    expect(result).toEqual({ ok: true });
    expect(subscribeToPushMock).toHaveBeenCalledTimes(1);
    expect(subscribeToPushMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://push.example/AAA",
        keys: { p256dh: "p", auth: "a" },
        timezone: "Australia/Brisbane",
      }),
    );
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });

  it("does not subscribe at all when permission is refused", async () => {
    requestPermissionMock.mockResolvedValue("denied");

    const result = await subscribeThisDevice();

    expect(result).toEqual({ ok: false, reason: "denied" });
    expect(subscribeMock).not.toHaveBeenCalled();
    expect(subscribeToPushMock).not.toHaveBeenCalled();
  });

  it("on a conflict, drops the endpoint and retries with a FRESH one", async () => {
    // The shared-computer case. `pushManager.subscribe()` returns the EXISTING
    // subscription, so a second press alone cannot help — the browser has to
    // drop it first. The two endpoints below being *different* is the whole
    // assertion: retrying with the same one would just be refused again.
    subscribeMock
      .mockResolvedValueOnce(subscription("https://push.example/OLD"))
      .mockResolvedValueOnce(subscription("https://push.example/NEW"));
    subscribeToPushMock
      .mockResolvedValueOnce({ ok: false, error: "taken", reason: "conflict" })
      .mockResolvedValueOnce({ ok: true });

    const result = await subscribeThisDevice();

    expect(result).toEqual({ ok: true });
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(subscribeToPushMock).toHaveBeenCalledTimes(2);
    const [first, second] = endpointsSent();
    expect(first).toBe("https://push.example/OLD");
    expect(second).toBe("https://push.example/NEW");
    expect(second).not.toBe(first);
  });

  it("retries once only: a second conflict is an error, not another attempt", async () => {
    // A second conflict means something other than a stale local subscription
    // is wrong, and churning would unsubscribe/re-subscribe forever.
    subscribeMock
      .mockResolvedValueOnce(subscription("https://push.example/OLD"))
      .mockResolvedValueOnce(subscription("https://push.example/NEW"));
    subscribeToPushMock.mockResolvedValue({
      ok: false,
      error: "taken",
      reason: "conflict",
    });

    const result = await subscribeThisDevice();

    expect(result).toEqual({ ok: false, reason: "error" });
    expect(subscribeToPushMock).toHaveBeenCalledTimes(2);
    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-conflict failure", async () => {
    // Only `reason: "conflict"` means "this endpoint belongs to someone else".
    // Minting a fresh endpoint for a plain server error would burn a working
    // subscription to no purpose.
    subscribeMock.mockResolvedValue(subscription("https://push.example/AAA"));
    subscribeToPushMock.mockResolvedValue({ ok: false, error: "database down" });

    const result = await subscribeThisDevice();

    expect(result).toEqual({ ok: false, reason: "error" });
    expect(subscribeToPushMock).toHaveBeenCalledTimes(1);
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });

  it("reports an error rather than throwing when unsubscribe fails", async () => {
    subscribeMock.mockResolvedValue(subscription("https://push.example/OLD"));
    subscribeToPushMock.mockResolvedValue({
      ok: false,
      error: "taken",
      reason: "conflict",
    });
    unsubscribeMock.mockRejectedValue(new Error("no"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await subscribeThisDevice();

    expect(result).toEqual({ ok: false, reason: "error" });
    expect(subscribeToPushMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
