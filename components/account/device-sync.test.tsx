import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { reconcileDeviceMock, deviceTimeZoneMock } = vi.hoisted(() => ({
  reconcileDeviceMock: vi.fn().mockResolvedValue({ known: true, healed: false }),
  deviceTimeZoneMock: vi.fn(() => "Australia/Brisbane"),
}));

vi.mock("@/server/actions/devices", () => ({ reconcileDevice: reconcileDeviceMock }));
vi.mock("@/lib/tz", () => ({ deviceTimeZone: deviceTimeZoneMock }));

import { DeviceSync } from "@/components/account/device-sync";

function stubPush(subscription: unknown, extraPushManager: Record<string, unknown> = {}) {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(subscription),
          ...extraPushManager,
        },
      }),
    },
  });
  // @ts-expect-error — test stub
  window.PushManager = function () {};
  // @ts-expect-error — test stub
  window.Notification = { permission: "granted" };
}

const LIVE = {
  endpoint: "https://web.push.apple.com/AAA",
  toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }),
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-key");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("DeviceSync", () => {
  it("reports a live subscription with its zone", async () => {
    stubPush(LIVE);
    render(<DeviceSync />);
    await waitFor(() =>
      expect(reconcileDeviceMock).toHaveBeenCalledWith({
        endpoint: "https://web.push.apple.com/AAA",
        keys: { p256dh: "p", auth: "a" },
        timezone: "Australia/Brisbane",
        userAgent: expect.any(String),
      }),
    );
  });

  // Nothing to report and nothing to create. Subscribing here would be
  // granting permission on somebody's behalf.
  it("does nothing when this browser holds no subscription", async () => {
    stubPush(null);
    render(<DeviceSync />);
    await waitFor(() => expect(reconcileDeviceMock).not.toHaveBeenCalled());
  });

  // The assertion above only proves reconcileDevice was never called — it
  // cannot tell "correctly did nothing" apart from "tried to subscribe and
  // had the failure swallowed by the try/catch". This test closes that gap
  // by spying directly on subscribe(): creating a subscription here would be
  // opting a Traveller into push they never agreed to, invisibly.
  it("never calls pushManager.subscribe when this browser holds no subscription", async () => {
    const subscribe = vi.fn();
    stubPush(null, { subscribe });
    render(<DeviceSync />);

    const { serviceWorker } = navigator;
    const { pushManager } = await serviceWorker.ready;
    // Wait for a signal that the effect's async path actually ran to
    // completion before asserting the negative — otherwise this passes
    // vacuously before getSubscription is even called.
    await waitFor(() => expect(pushManager.getSubscription).toHaveBeenCalled());

    expect(subscribe).not.toHaveBeenCalled();
  });

  it("renders nothing", () => {
    stubPush(LIVE);
    const { container } = render(<DeviceSync />);
    expect(container).toBeEmptyDOMElement();
  });

  // A failed reconcile leaves the stored state as it was — wrong, but no worse
  // than before, and the Account page says out loud when it disagrees.
  it("survives a failing reconcile", async () => {
    stubPush(LIVE);
    reconcileDeviceMock.mockRejectedValueOnce(new Error("offline"));
    const { container } = render(<DeviceSync />);
    await waitFor(() => expect(reconcileDeviceMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  describe("on returning to the foreground", () => {
    function showApp() {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      deviceTimeZoneMock.mockReturnValue("Australia/Brisbane");
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("reports again when the zone has changed", async () => {
      stubPush(LIVE);
      render(<DeviceSync />);
      await waitFor(() => expect(reconcileDeviceMock).toHaveBeenCalledTimes(1));

      deviceTimeZoneMock.mockReturnValue("Europe/Paris");
      showApp();
      await waitFor(() => expect(reconcileDeviceMock).toHaveBeenCalledTimes(2));
      expect(reconcileDeviceMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ timezone: "Europe/Paris" }),
      );
    });

    it("reports again after more than 6 hours in the same zone", async () => {
      stubPush(LIVE);
      render(<DeviceSync />);
      await waitFor(() => expect(reconcileDeviceMock).toHaveBeenCalledTimes(1));

      vi.setSystemTime(Date.now() + 6 * 60 * 60 * 1000 + 1000);
      showApp();
      await waitFor(() => expect(reconcileDeviceMock).toHaveBeenCalledTimes(2));
    });

    it("does not report again for the same zone within 6 hours", async () => {
      stubPush(LIVE);
      render(<DeviceSync />);
      await waitFor(() => expect(reconcileDeviceMock).toHaveBeenCalledTimes(1));

      vi.setSystemTime(Date.now() + 60 * 60 * 1000);
      showApp();
      await Promise.resolve();
      expect(reconcileDeviceMock).toHaveBeenCalledTimes(1);
    });

    it("does not report when the app goes to the background", async () => {
      stubPush(LIVE);
      render(<DeviceSync />);
      await waitFor(() => expect(reconcileDeviceMock).toHaveBeenCalledTimes(1));

      deviceTimeZoneMock.mockReturnValue("Europe/Paris");
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await Promise.resolve();
      expect(reconcileDeviceMock).toHaveBeenCalledTimes(1);
    });
  });
});
