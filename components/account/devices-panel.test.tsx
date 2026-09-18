import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceSummary } from "@/server/actions/devices";

const {
  readLocalDeviceStateMock,
  removeDeviceByIdMock,
  listDevicesMock,
  unsubscribeFromPushMock,
  isPushConfiguredMock,
  subscribeThisDeviceMock,
} = vi.hoisted(() => ({
  readLocalDeviceStateMock: vi.fn(),
  removeDeviceByIdMock: vi.fn().mockResolvedValue({ ok: true }),
  listDevicesMock: vi.fn().mockResolvedValue([]),
  unsubscribeFromPushMock: vi.fn().mockResolvedValue({ ok: true }),
  isPushConfiguredMock: vi.fn().mockReturnValue(true),
  subscribeThisDeviceMock: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/components/account/device-state", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  readLocalDeviceState: readLocalDeviceStateMock,
}));
vi.mock("@/server/actions/devices", () => ({
  removeDeviceById: removeDeviceByIdMock,
  listDevices: listDevicesMock,
}));
vi.mock("@/server/actions/push", () => ({ unsubscribeFromPush: unsubscribeFromPushMock }));
// `DevicesPanel` no longer only *imports* `EnableDevice`'s module for the
// subscribe flow — it also reads whether this deployment has VAPID keys
// configured at all (`isPushConfigured`). That fact is a module-level
// constant computed once at import time from `process.env`, so it cannot be
// toggled per test via `vi.stubEnv` the way `enable-device.test.tsx` does;
// mocking the module is the only way to control it here.
vi.mock("@/components/account/enable-device", () => ({
  isPushConfigured: isPushConfiguredMock,
  subscribeThisDevice: subscribeThisDeviceMock,
}));

import { DevicesPanel } from "@/components/account/devices-panel";

const device = (over: Partial<DeviceSummary> = {}): DeviceSummary => ({
  id: "sub-1",
  label: "iPhone",
  timezone: "Australia/Brisbane",
  subscribedAt: new Date("2026-09-01T00:00:00.000Z"),
  lastSeenAt: new Date("2026-09-17T09:00:00.000Z"),
  isThisDevice: true,
  stale: false,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-17T10:00:00.000Z"));
  readLocalDeviceStateMock.mockResolvedValue({
    permission: "granted",
    endpoint: "https://web.push.apple.com/AAA",
    keys: { p256dh: "p", auth: "a" },
    needsInstall: false,
  });
  isPushConfiguredMock.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("DevicesPanel", () => {
  it("names a device and when it was last seen", async () => {
    const initial = [device()];
    // Once this browser's real endpoint is known, the panel re-fetches the
    // authoritative list against it (finding 1) — the mock must mirror
    // `initial` or the refetch would wipe the row this test is about.
    listDevicesMock.mockResolvedValue(initial);
    render(<DevicesPanel initial={initial} />);
    expect(await screen.findByText(/iPhone/)).toBeInTheDocument();
    expect(screen.getByText(/Australia\/Brisbane/)).toBeInTheDocument();
    expect(screen.getByText(/seen 1 hour ago/)).toBeInTheDocument();
  });

  it("calls out a stale device without offering to delete it for you", async () => {
    const initial = [
      device({ isThisDevice: false, stale: true, lastSeenAt: new Date("2026-08-20T00:00:00.000Z") }),
    ];
    listDevicesMock.mockResolvedValue(initial);
    render(<DevicesPanel initial={initial} />);
    expect(await screen.findByText(/unseen since 20 Aug 2026/)).toBeInTheDocument();
  });

  // THE regression test for this whole plan. A Traveller with a device on file
  // that is not this one must still be offered a way to subscribe here.
  it("offers Enable on this device even when other devices exist", async () => {
    readLocalDeviceStateMock.mockResolvedValue({
      permission: "default",
      endpoint: null,
      keys: null,
      needsInstall: false,
    });
    render(<DevicesPanel initial={[device({ isThisDevice: false })]} />);
    expect(await screen.findByRole("button", { name: /enable on this device/i })).toBeInTheDocument();
  });

  // The account page can only ever call listDevices(null) — a server render
  // has no way to know this browser's endpoint — so every row's
  // `isThisDevice` arrives false regardless of the truth. The panel must
  // re-derive it itself once it learns its own endpoint (finding 1).
  it("re-derives isThisDevice from a fresh fetch once this browser's endpoint is known", async () => {
    const asServerSeesIt = [device({ isThisDevice: false })];
    const asThisBrowserActuallyIs = [device({ isThisDevice: true })];
    listDevicesMock.mockResolvedValue(asThisBrowserActuallyIs);
    render(<DevicesPanel initial={asServerSeesIt} />);
    expect(await screen.findByText(/this device/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /enable on this device/i }),
    ).not.toBeInTheDocument();
  });

  // Negative counterpart: an implementation that always rendered Enable,
  // regardless of whether this browser is already a known Device, would pass
  // every other test in this file but must fail this one.
  it("does not offer Enable when this browser is already a known device", async () => {
    const initial = [device({ isThisDevice: true })];
    listDevicesMock.mockResolvedValue(initial);
    render(<DevicesPanel initial={initial} />);
    await screen.findByText(/iPhone/);
    expect(
      screen.queryByRole("button", { name: /enable on this device/i }),
    ).not.toBeInTheDocument();
  });

  it("says so when this browser has blocked digests", async () => {
    readLocalDeviceStateMock.mockResolvedValue({
      permission: "denied",
      endpoint: null,
      keys: null,
      needsInstall: false,
    });
    render(<DevicesPanel initial={[]} />);
    expect(await screen.findByText(/blocked/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enable on this device/i })).not.toBeInTheDocument();
  });

  it("tells an uninstalled iPhone to add TEEPEE to the Home Screen first", async () => {
    readLocalDeviceStateMock.mockResolvedValue({
      permission: "default",
      endpoint: null,
      keys: null,
      needsInstall: true,
    });
    render(<DevicesPanel initial={[]} />);
    expect(await screen.findByText(/home screen/i)).toBeInTheDocument();
    // Pins the button's own visible label — a broad text query passing is
    // not proof the button itself reads what the brief requires.
    expect(
      screen.getByRole("button", { name: "Add to Home Screen first" }),
    ).toBeInTheDocument();
  });

  it("says the deployment, not this browser, is the problem when VAPID keys aren't configured", async () => {
    isPushConfiguredMock.mockReturnValue(false);
    const initial = [device({ isThisDevice: false })];
    listDevicesMock.mockResolvedValue(initial);
    render(<DevicesPanel initial={initial} />);
    expect(await screen.findByText(/vapid/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /enable on this device/i }),
    ).not.toBeInTheDocument();
  });

  // Removing another device cannot revoke its permission, so the copy must
  // not pretend otherwise (ADR 0048).
  it("warns that a removed other device may come back", async () => {
    const initial = [device({ isThisDevice: false })];
    listDevicesMock.mockResolvedValue(initial);
    const user = (await import("@testing-library/user-event")).default.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    render(<DevicesPanel initial={initial} />);
    await user.click(await screen.findByRole("button", { name: /remove/i }));
    await waitFor(() => expect(removeDeviceByIdMock).toHaveBeenCalledWith("sub-1"));
    expect(await screen.findByText(/re-appear/i)).toBeInTheDocument();
  });

  // Removing THIS device must revoke the browser subscription too. Deleting
  // the row alone leaves a live subscription the server has forgotten — which
  // reconcileDevice would heal straight back on the next visit.
  it("unsubscribes the browser when removing this device", async () => {
    const initial = [device({ isThisDevice: true })];
    listDevicesMock.mockResolvedValue(initial);
    const unsubscribe = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: { getSubscription: vi.fn().mockResolvedValue({ unsubscribe }) },
        }),
      },
    });
    const user = (await import("@testing-library/user-event")).default.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    render(<DevicesPanel initial={initial} />);
    await user.click(await screen.findByRole("button", { name: /remove/i }));
    await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
    expect(unsubscribeFromPushMock).toHaveBeenCalledWith("https://web.push.apple.com/AAA");
    // The order is load-bearing (item 8): unsubscribing the browser's own
    // subscription must happen BEFORE the server row is dropped, or a
    // traveller who loses the tab mid-removal is left with a deleted row and
    // a live subscription — the orphan bug, inverted. Waiting for both calls
    // and then asserting each was made (as above) is satisfied even by an
    // implementation that reverses the order; only comparing their
    // invocation order actually pins it.
    expect(unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
      unsubscribeFromPushMock.mock.invocationCallOrder[0],
    );
  });

  it("does not silently drop this device's row when its endpoint isn't known", async () => {
    // permission is granted but no live subscription was found — this browser
    // claims to be a known Device yet holds no endpoint to revoke.
    readLocalDeviceStateMock.mockResolvedValue({
      permission: "granted",
      endpoint: null,
      keys: null,
      needsInstall: false,
    });
    const initial = [device({ isThisDevice: true })];
    const user = (await import("@testing-library/user-event")).default.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    render(<DevicesPanel initial={initial} />);
    await user.click(await screen.findByRole("button", { name: /remove/i }));
    expect(removeDeviceByIdMock).not.toHaveBeenCalled();
    expect(unsubscribeFromPushMock).not.toHaveBeenCalled();
  });

  it("shows a failure message rather than doing nothing when removal throws", async () => {
    readLocalDeviceStateMock.mockResolvedValue({
      permission: "granted",
      endpoint: "https://web.push.apple.com/AAA",
      keys: { p256dh: "p", auth: "a" },
      needsInstall: false,
    });
    const initial = [device({ isThisDevice: false })];
    listDevicesMock.mockResolvedValue(initial);
    removeDeviceByIdMock.mockRejectedValueOnce(new Error("network down"));
    const user = (await import("@testing-library/user-event")).default.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    render(<DevicesPanel initial={initial} />);
    await user.click(await screen.findByRole("button", { name: /remove/i }));
    expect(await screen.findByText(/couldn.t remove/i)).toBeInTheDocument();
  });

  // Item 1: before `readLocalDeviceState()` resolves there is nothing
  // truthful to say about THIS browser yet, so neither the "this device"
  // marker nor the Enable control may appear — even for a row whose data
  // already claims `isThisDevice: true`.
  it("shows nothing about this browser before readLocalDeviceState resolves", () => {
    readLocalDeviceStateMock.mockReturnValue(new Promise(() => {}));
    render(<DevicesPanel initial={[device({ isThisDevice: true })]} />);
    expect(screen.getByText(/iPhone/)).toBeInTheDocument();
    expect(screen.queryByText(/this device/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /enable on this device/i }),
    ).not.toBeInTheDocument();
  });

  it("never renders the word notification", async () => {
    const initial = [device()];
    listDevicesMock.mockResolvedValue(initial);
    const { container } = render(<DevicesPanel initial={initial} />);
    await screen.findByText(/iPhone/);
    expect(container.textContent?.toLowerCase()).not.toContain("notification");
  });
});
