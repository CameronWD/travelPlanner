import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@radix-ui/react-toast";
import { Toast, ToastTitle, ToastViewport, ToastClose, ToastAction } from "./toast";

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

describe("Toast variant", () => {
  // A Traveller must be able to tell a failure from a confirmation at a
  // glance. If `destructive` ever collapses back onto the same fill as
  // `default`/`success` (e.g. because a base class silently wins a
  // tailwind-merge conflict again), every "Couldn't save/update/delete..."
  // toast across the app reads as a success. This protects that distinction.
  it("gives destructive a different fill than default and success, so an error toast doesn't read as a confirmation", () => {
    render(
      <ToastProvider>
        <Toast open data-testid="toast-default">
          <ToastTitle>Saved</ToastTitle>
        </Toast>
        <Toast open variant="success" data-testid="toast-success">
          <ToastTitle>Added</ToastTitle>
        </Toast>
        <Toast open variant="destructive" data-testid="toast-destructive">
          <ToastTitle>Couldn&apos;t save</ToastTitle>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );

    const defaultCard = screen.getByTestId("toast-default");
    const successCard = screen.getByTestId("toast-success");
    const destructiveCard = screen.getByTestId("toast-destructive");

    // default and success intentionally share the one designed look.
    expect(defaultCard.className).toContain("bg-teal");
    expect(defaultCard.className).toContain("island");
    expect(successCard.className).toContain("bg-teal");
    expect(successCard.className).toContain("island");

    // destructive must carry its own fill, not the teal one.
    expect(destructiveCard.className).toContain("bg-destructive");
    expect(destructiveCard.className).toContain("text-destructive-foreground");
    expect(destructiveCard.className).not.toContain("bg-teal");
    expect(destructiveCard.className.split(/\s+/)).not.toContain("island");
  });

  it("rescopes --foreground, --muted-foreground and --border on destructive instead of using island, so Description/Action/Close stay legible on the red fill instead of the teal-tuned ink", () => {
    render(
      <ToastProvider>
        <Toast open variant="destructive" data-testid="toast-destructive-vars">
          <ToastTitle>Couldn&apos;t save</ToastTitle>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    const card = screen.getByTestId("toast-destructive-vars");
    expect(card.className).toContain("[--foreground:var(--destructive-foreground)]");
    expect(card.className).toContain(
      "[--muted-foreground:var(--destructive-foreground)]",
    );
    expect(card.className).toContain("[--border:var(--destructive-foreground)]");
  });

  // --muted is never rescoped (not by island, not by the destructive
  // overrides above), but the hover text colour on ToastAction/ToastClose
  // IS rescoped (it comes from --foreground). A hover background sourced
  // from --muted would therefore come from a different colour system than
  // the label sitting on top of it, and the two could fail contrast against
  // each other independently of the toast's own fill. Deriving the hover
  // background from --foreground instead means the pair can never drift
  // apart, on this variant or any future one.
  it("derives the hover background from --foreground, the same variable the hover text comes from, so the pair can't drift out of contrast on an accent-filled toast", () => {
    render(
      <ToastProvider>
        <Toast open variant="destructive">
          <ToastTitle>Couldn&apos;t save</ToastTitle>
          <ToastAction altText="Retry" data-testid="toast-action">
            Retry
          </ToastAction>
          <ToastClose data-testid="toast-close" />
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );

    const action = screen.getByTestId("toast-action");
    const close = screen.getByTestId("toast-close");

    expect(action.className).toContain("hover:bg-foreground/10");
    expect(action.className).not.toContain("hover:bg-muted");

    expect(close.className).toContain("hover:bg-foreground/10");
    expect(close.className).not.toContain("hover:bg-muted");
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
