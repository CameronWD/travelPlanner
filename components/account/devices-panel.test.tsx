import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceSummary } from "@/server/actions/devices";

const {
  readLocalDeviceStateMock,
  removeDeviceByIdMock,
  listDevicesMock,
  unsubscribeFromPushMock,
} = vi.hoisted(() => ({
  readLocalDeviceStateMock: vi.fn(),
  removeDeviceByIdMock: vi.fn().mockResolvedValue({ ok: true }),
  listDevicesMock: vi.fn().mockResolvedValue([]),
  unsubscribeFromPushMock: vi.fn().mockResolvedValue({ ok: true }),
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
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("DevicesPanel", () => {
  it("names a device and when it was last seen", async () => {
    render(<DevicesPanel initial={[device()]} />);
    expect(await screen.findByText(/iPhone/)).toBeInTheDocument();
    expect(screen.getByText(/Australia\/Brisbane/)).toBeInTheDocument();
    expect(screen.getByText(/seen 1 hour ago/)).toBeInTheDocument();
  });

  it("calls out a stale device without offering to delete it for you", async () => {
    render(<DevicesPanel initial={[device({ isThisDevice: false, stale: true, lastSeenAt: new Date("2026-08-20T00:00:00.000Z") })]} />);
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
  });

  // Removing another device cannot revoke its permission, so the copy must
  // not pretend otherwise (ADR 0048).
  it("warns that a removed other device may come back", async () => {
    const user = (await import("@testing-library/user-event")).default.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    render(<DevicesPanel initial={[device({ isThisDevice: false })]} />);
    await user.click(await screen.findByRole("button", { name: /remove/i }));
    await waitFor(() => expect(removeDeviceByIdMock).toHaveBeenCalledWith("sub-1"));
    expect(await screen.findByText(/re-appear/i)).toBeInTheDocument();
  });

  // Removing THIS device must revoke the browser subscription too. Deleting
  // the row alone leaves a live subscription the server has forgotten — which
  // reconcileDevice would heal straight back on the next visit.
  it("unsubscribes the browser when removing this device", async () => {
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
    render(<DevicesPanel initial={[device({ isThisDevice: true })]} />);
    await user.click(await screen.findByRole("button", { name: /remove/i }));
    await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
    expect(unsubscribeFromPushMock).toHaveBeenCalledWith("https://web.push.apple.com/AAA");
  });

  it("never renders the word notification", async () => {
    const { container } = render(<DevicesPanel initial={[device()]} />);
    await screen.findByText(/iPhone/);
    expect(container.textContent?.toLowerCase()).not.toContain("notification");
  });
});
