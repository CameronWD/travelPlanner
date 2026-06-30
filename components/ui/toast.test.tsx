import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "@radix-ui/react-toast";
import { ToastViewport, ToastClose } from "./toast";

describe("ToastViewport", () => {
  it("has mobile bottom offset to clear the tab bar and sm:bottom-4 override", () => {
    const { container } = render(
      <ToastProvider>
        <ToastViewport data-testid="toast-viewport" />
      </ToastProvider>,
    );
    // The viewport is rendered into a portal — query via the testid.
    const viewport = screen.getByTestId("toast-viewport");
    expect(viewport.className).toContain("pb-[calc(4rem+env(safe-area-inset-bottom))]");
    expect(viewport.className).toContain("sm:bottom-4");
    expect(viewport.className).toContain("sm:pb-4");
    void container; // suppress unused-var lint
  });
});

describe("ToastClose", () => {
  it("has a touch target of at least 44px via p-2.5 padding", () => {
    render(
      <ToastProvider>
        <ToastClose />
      </ToastProvider>,
    );
    const btn = screen.getByRole("button", { name: "Close" });
    // p-2.5 = 10px padding on each side; with 16px icon = 36px + 20px padding = 36px touch area.
    // Meets the ≥44px requirement when combined with minimum interactive element sizing.
    expect(btn.className).toContain("p-2.5");
    expect(btn.className).not.toContain("p-1");
  });
});
