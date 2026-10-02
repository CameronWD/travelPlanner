import { afterEach, describe, expect, it } from "vitest";
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
});
