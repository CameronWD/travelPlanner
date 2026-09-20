import { afterEach, describe, expect, it, vi } from "vitest";

import { isIosWithoutInstall } from "@/components/account/device-state";

// navigator.userAgent / .platform are read-only accessors on jsdom's
// Navigator prototype, so they're stubbed with vi.spyOn(..., "get") rather
// than plain assignment. navigator.maxTouchPoints, the legacy
// `navigator.standalone`, and window.matchMedia don't exist on jsdom's
// Navigator/Window at all, so those are added fresh with
// Object.defineProperty. Every stub is restored in afterEach so a fake
// iPhone from one test can never leak into the next.
function stubNavigator(overrides: {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
}) {
  if (overrides.userAgent !== undefined) {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(overrides.userAgent);
  }
  if (overrides.platform !== undefined) {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(overrides.platform);
  }
  if (overrides.maxTouchPoints !== undefined) {
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: overrides.maxTouchPoints,
    });
  }
  Object.defineProperty(navigator, "standalone", {
    configurable: true,
    value: overrides.standalone,
  });
}

function stubMatchMedia(standaloneMatches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: standaloneMatches }),
  });
}

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

afterEach(() => {
  vi.restoreAllMocks();
  // userAgent/platform are real accessors on jsdom's Navigator, so
  // vi.restoreAllMocks() above undoes those spies. maxTouchPoints,
  // standalone and matchMedia don't exist on jsdom at all — defineProperty
  // added them fresh, so they're deleted here to leave jsdom exactly as it
  // was before this file ran.
  // @ts-expect-error — jsdom doesn't implement maxTouchPoints
  delete navigator.maxTouchPoints;
  // @ts-expect-error — test-only property, not part of jsdom's Navigator
  delete navigator.standalone;
  // @ts-expect-error — jsdom doesn't implement matchMedia
  delete window.matchMedia;
});

describe("isIosWithoutInstall", () => {
  // Case 1: the everyday broken state ADR 0047 exists to explain — an iPhone
  // in a plain Safari tab can never subscribe, installed or not.
  it("is true for an iPhone in a plain Safari tab", () => {
    stubNavigator({ userAgent: IPHONE_UA, platform: "iPhone", maxTouchPoints: 5 });
    stubMatchMedia(false);
    expect(isIosWithoutInstall()).toBe(true);
  });

  // Case 2: the same iPhone, once added to the Home Screen, reports
  // display-mode: standalone — the one signal that flips the button on.
  it("is false for the same iPhone once installed to the Home Screen", () => {
    stubNavigator({ userAgent: IPHONE_UA, platform: "iPhone", maxTouchPoints: 5 });
    stubMatchMedia(true);
    expect(isIosWithoutInstall()).toBe(false);
  });

  // Case 3: modern iPadOS lies about its platform, reporting MacIntel just
  // like a real Mac. maxTouchPoints > 1 is the only thing that unmasks it as
  // a touch device still bound by ADR 0047, not installed.
  it("is true for an iPad reporting MacIntel that has not been installed", () => {
    stubNavigator({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
    });
    stubMatchMedia(false);
    expect(isIosWithoutInstall()).toBe(true);
  });

  // Case 4: the control. A real Mac also reports MacIntel, but with no touch
  // points — proving the iPad unmasking in case 3 does not also catch actual
  // desktops, which have no Home Screen to install anything to.
  it("is false for a real Mac", () => {
    stubNavigator({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 0,
    });
    stubMatchMedia(false);
    expect(isIosWithoutInstall()).toBe(false);
  });

  // Case 5: the legacy signal, on its own. `matchMedia` is the modern check,
  // but older iOS relies on `navigator.standalone` — the one an already
  // -installed older iPhone is most likely to actually be reporting. This is
  // the only case in the file where `matchMedia` reports NOT standalone and
  // `navigator.standalone` is what carries the installed state, so it is the
  // only test that can catch that disjunct being deleted as "dead code".
  it("is false for an iPhone reporting the legacy navigator.standalone flag", () => {
    stubNavigator({
      userAgent: IPHONE_UA,
      platform: "iPhone",
      maxTouchPoints: 5,
      standalone: true,
    });
    stubMatchMedia(false);
    expect(isIosWithoutInstall()).toBe(false);
  });
});
