import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Tests for EnableNotifications.
 *
 * Mocks: server/actions/push
 *
 * navigator.userAgent / platform / maxTouchPoints / standalone and
 * window.matchMedia are stubbed per test and torn down in afterEach so
 * state never leaks into other test files sharing this worker.
 */

vi.mock("@/server/actions/push", () => ({
  subscribeToPush: vi.fn(),
}));

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function stubNavigator(opts: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
}) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: opts.userAgent,
    configurable: true,
  });
  Object.defineProperty(window.navigator, "platform", {
    value: opts.platform ?? "",
    configurable: true,
  });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    value: opts.maxTouchPoints ?? 0,
    configurable: true,
  });
  if (opts.standalone !== undefined) {
    Object.defineProperty(window.navigator, "standalone", {
      value: opts.standalone,
      configurable: true,
    });
  }
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    ((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof matchMedia,
  );
}

function stubPushSupport() {
  vi.stubGlobal("Notification", {});
  vi.stubGlobal("PushManager", {});
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: {},
    configurable: true,
  });
}

afterEach(() => {
  delete (window.navigator as { userAgent?: string }).userAgent;
  delete (window.navigator as { platform?: string }).platform;
  delete (window.navigator as { maxTouchPoints?: number }).maxTouchPoints;
  delete (window.navigator as { standalone?: boolean }).standalone;
  delete (window.navigator as { serviceWorker?: unknown }).serviceWorker;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("EnableNotifications — iOS without install", () => {
  it("renders 'Add to Home Screen first' and no enable button for an iOS user-agent without standalone", async () => {
    stubNavigator({ userAgent: IPHONE_UA, standalone: false });
    stubMatchMedia(false);

    const { EnableNotifications } = await import("./enable-notifications");
    render(<EnableNotifications />);

    expect(
      screen.getByRole("button", { name: "Add to Home Screen first" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Tap Share/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Enable trip reminders/i }),
    ).not.toBeInTheDocument();
  });
});

describe("EnableNotifications — desktop with push configured", () => {
  it("renders the enable button for a desktop user-agent with the VAPID key set", async () => {
    stubNavigator({ userAgent: DESKTOP_UA, platform: "Win32", maxTouchPoints: 0 });
    stubPushSupport();
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-vapid-key");
    vi.resetModules();

    const { EnableNotifications } = await import("./enable-notifications");
    render(<EnableNotifications />);

    expect(
      screen.getByRole("button", { name: /Enable trip reminders/i }),
    ).toBeInTheDocument();
  });
});
