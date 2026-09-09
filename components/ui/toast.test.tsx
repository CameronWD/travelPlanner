import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "@radix-ui/react-toast";
import { ToastViewport, ToastClose } from "./toast";

describe("ToastViewport", () => {
  it("has mobile bottom offset to clear the Feedback trigger and md:bottom-[4.25rem] override", () => {
    const { container } = render(
      <ToastProvider>
        <ToastViewport data-testid="toast-viewport" />
      </ToastProvider>,
    );
    // The viewport is rendered into a portal — query via the testid.
    const viewport = screen.getByTestId("toast-viewport");
    expect(viewport.className).toContain(
      "pb-[calc(8.25rem+env(safe-area-inset-bottom))]",
    );
    expect(viewport.className).toContain("md:bottom-[4.25rem]");
    expect(viewport.className).toContain("md:pb-4");
    void container; // suppress unused-var lint
  });

  it("reserves clearance above the bottom-right Feedback trigger at the md breakpoint", () => {
    render(
      <ToastProvider>
        <ToastViewport data-testid="toast-viewport-md" />
      </ToastProvider>,
    );
    const viewport = screen.getByTestId("toast-viewport-md");
    // The trigger's own offset switches at md (components/feedback/feedback-launcher.tsx),
    // so the toast clearance must switch at the same breakpoint rather than sm —
    // sm would leave the 640-768px band (tab bar still visible, trigger still at
    // 5rem) overlapping.
    expect(viewport.className).toContain("md:right-4");
    expect(viewport.className).not.toContain("sm:bottom-4");
    expect(viewport.className).not.toContain("sm:pb-4");
  });
});

describe("ToastClose", () => {
  it("has a touch target of at least 44px via p-3.5 padding", () => {
    render(
      <ToastProvider>
        <ToastClose />
      </ToastProvider>,
    );
    const btn = screen.getByRole("button", { name: "Close" });
    // p-3.5 = 14px padding on each side; with 16px icon = 14 + 16 + 14 = 44px total touch target.
    expect(btn.className).toContain("p-3.5");
    expect(btn.className).not.toContain("p-2.5");
  });
});
