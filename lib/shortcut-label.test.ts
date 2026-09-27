import { describe, it, expect, afterEach, vi } from "vitest";
import { shortcutLabel } from "./shortcut-label";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubNavigator(nav: Partial<Navigator> & { userAgentData?: { platform?: string } }) {
  vi.stubGlobal("navigator", { platform: "", userAgent: "", ...nav });
}

describe("shortcutLabel", () => {
  it("returns 'Ctrl K' for a Windows user agent", () => {
    stubNavigator({
      platform: "Win32",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36",
    });
    expect(shortcutLabel()).toBe("Ctrl K");
  });

  it("returns '⌘K' on a Mac (navigator.platform)", () => {
    stubNavigator({ platform: "MacIntel", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)" });
    expect(shortcutLabel()).toBe("⌘K");
  });

  it("prefers userAgentData.platform when present", () => {
    stubNavigator({ platform: "", userAgent: "", userAgentData: { platform: "macOS" } });
    expect(shortcutLabel()).toBe("⌘K");
  });

  it("returns 'Ctrl K' on Linux", () => {
    stubNavigator({ platform: "Linux x86_64", userAgent: "Mozilla/5.0 (X11; Linux x86_64)" });
    expect(shortcutLabel()).toBe("Ctrl K");
  });
});
