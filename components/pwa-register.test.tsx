import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { PwaRegister } from "./pwa-register";
import { clearInstallPrompt, getInstallPrompt } from "@/lib/install-prompt";

afterEach(() => clearInstallPrompt());

describe("PwaRegister", () => {
  it("captures a beforeinstallprompt fired after mount, in any environment", () => {
    render(<PwaRegister />);
    const e = new Event("beforeinstallprompt", { cancelable: true });
    window.dispatchEvent(e);
    expect(getInstallPrompt()).toBe(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it("stops listening on unmount", () => {
    const { unmount } = render(<PwaRegister />);
    unmount();
    window.dispatchEvent(new Event("beforeinstallprompt", { cancelable: true }));
    expect(getInstallPrompt()).toBeNull();
  });

  it("registers the service worker with this build's id (spec 2026-10-06 §T)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "b1");
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
    try {
      render(<PwaRegister />);
      expect(register).toHaveBeenCalledWith("/sw.js?build=b1");
    } finally {
      vi.unstubAllEnvs();
      Reflect.deleteProperty(navigator, "serviceWorker");
    }
  });
});
