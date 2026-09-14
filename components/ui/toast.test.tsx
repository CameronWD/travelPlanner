import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@radix-ui/react-toast";
import { Toast, ToastTitle, ToastViewport, ToastClose } from "./toast";

describe("ToastViewport", () => {
  it("has mobile bottom offset to clear the Feedback trigger and md:bottom override", () => {
    const { container } = render(
      <ToastProvider>
        <ToastViewport data-testid="toast-viewport" />
      </ToastProvider>,
    );
    // The viewport is rendered into a portal — query via the testid.
    const viewport = screen.getByTestId("toast-viewport");
    // Clearance is computed from the tab bar's published height (--tp-tab-bar-h,
    // app/globals.css) + 1rem gap + 2.75rem FAB + 0.5rem spare = tab bar + 4.25rem.
    expect(viewport.className).toContain(
      "pb-[calc(var(--tp-tab-bar-h)+4.25rem+env(safe-area-inset-bottom))]",
    );
    // From md up the toasts move to the opposite corner from the Feedback
    // trigger and panel, so there is nothing left to clear and no env() term to
    // carry: the plain offset is correct there.
    expect(viewport.className).toContain("md:bottom-4");
    expect(viewport.className).not.toContain(
      "md:bottom-[calc(4.25rem+env(safe-area-inset-bottom))]",
    );
    expect(viewport.className).toContain("md:pb-4");
    void container; // suppress unused-var lint
  });

  it("reserves clearance above the bottom-right Feedback trigger below md", () => {
    render(
      <ToastProvider>
        <ToastViewport data-testid="toast-viewport-md" />
      </ToastProvider>,
    );
    const viewport = screen.getByTestId("toast-viewport-md");
    // The trigger's own offset switches at md (components/feedback/feedback-launcher.tsx),
    // so the toast treatment must switch at the same breakpoint rather than sm —
    // sm would leave the 640-768px band (tab bar still visible, trigger still at
    // 5rem, panel still full-screen) mishandled.
    expect(viewport.className).toContain("bottom-0");
    expect(viewport.className).toContain("right-0");
    expect(viewport.className).not.toContain("sm:bottom-4");
    expect(viewport.className).not.toContain("sm:pb-4");
    expect(viewport.className).not.toContain("sm:left-4");
  });

  it("moves to the bottom left from md up, off the docked Feedback panel", () => {
    render(
      <ToastProvider>
        <ToastViewport data-testid="toast-viewport-left" />
      </ToastProvider>,
    );
    const viewport = screen.getByTestId("toast-viewport-left");
    // The docked panel (components/ui/sheet.tsx side="docked") is flush with
    // md:bottom-[5.25rem] md:right-4 and up to 37.5rem tall, so a toast in that
    // corner covers its composer at z-100 however high it is lifted. It has to
    // be the other corner.
    expect(viewport.className).toContain("md:left-4");
    expect(viewport.className).toContain("md:right-auto");
  });

  it("is not hit-testable itself, even while a toast is on screen", async () => {
    render(
      <ToastProvider>
        <Toast open data-testid="toast-card">
          <ToastTitle>Saved</ToastTitle>
          <ToastClose />
        </Toast>
        <ToastViewport data-testid="toast-viewport-hit" />
      </ToastProvider>,
    );

    // Radix only sets pointerEvents:none on the viewport while the stack is
    // empty. With a toast up, the <ol> is a live z-100 surface covering the
    // Feedback trigger and the trip tab bar, so the class has to be ours.
    const viewport = screen.getByTestId("toast-viewport-hit");
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(viewport.className).toContain("pointer-events-none");
    expect(viewport.style.pointerEvents).not.toBe("auto");

    // ...and the toast card itself puts them back, or nothing on it is usable.
    const card = screen.getByTestId("toast-card");
    expect(card.className).toContain("pointer-events-auto");
  });

  it("enters from the right below md and from the left from md up, matching the viewport's corner", () => {
    render(
      <ToastProvider>
        <Toast open data-testid="toast-entry">
          <ToastTitle>Saved</ToastTitle>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    const card = screen.getByTestId("toast-entry");
    // Below md (and in the 640-768px band, where sm:max-w-sm still anchors
    // the viewport to the right) the toast still slides in from the right.
    expect(card.className).toContain(
      "motion-safe:data-[state=open]:tp-slide-in-right",
    );
    // From md up the viewport has moved to bottom-left (off the docked
    // Feedback panel), so entry has to flip to match — the override, not a
    // second unrelated class, since Tailwind still has to resolve one winner.
    expect(card.className).toContain(
      "md:motion-safe:data-[state=open]:tp-slide-in-left",
    );
  });

  it("keeps the toast card swipeable to dismiss", () => {
    render(
      <ToastProvider swipeDirection="right">
        <Toast open data-testid="toast-swipe">
          <ToastTitle>Saved</ToastTitle>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    const card = screen.getByTestId("toast-swipe");
    // The swipe transforms live on the card, which keeps pointer-events-auto —
    // making the viewport inert must not take the gesture with it.
    expect(card.className).toContain("pointer-events-auto");
    expect(card.className).toContain(
      "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)",
    );
    expect(card.className).toContain("data-[swipe=cancel]:translate-x-0");
    expect(card.className).toContain(
      "motion-safe:data-[swipe=end]:tp-slide-out-right",
    );
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

  it("still dismisses its toast once the viewport is inert", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Toast open onOpenChange={onOpenChange}>
          <ToastTitle>Saved</ToastTitle>
          <ToastClose />
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
