import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sheet, SheetContent, SheetTitle } from "./sheet";

describe("Sheet", () => {
  it("renders the dimming overlay by default", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Default</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(document.querySelector(".backdrop-blur-sm")).not.toBeNull();
  });

  it("omits the overlay when hideOverlay is set", () => {
    render(
      <Sheet open>
        <SheetContent hideOverlay>
          <SheetTitle>Docked</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(document.querySelector(".backdrop-blur-sm")).toBeNull();
  });

  it("is a bottom sheet by default, with the drag affordance", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Default</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.className).toContain("inset-x-0");
    expect(panel.className).toContain("bottom-0");
    expect(panel.querySelector('[aria-hidden="true"].bg-muted-foreground\\/30')).not.toBeNull();
  });

  it("docks to the bottom right from md up and fills the screen below it", () => {
    render(
      <Sheet open>
        <SheetContent side="docked" hideOverlay>
          <SheetTitle>Docked</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.className).toContain("inset-0");
    expect(panel.className).toContain("md:right-4");
    expect(panel.className).toContain("md:w-[560px]");
  });

  it("does not show the bottom sheet's drag affordance when docked", () => {
    render(
      <Sheet open>
        <SheetContent side="docked" hideOverlay>
          <SheetTitle>Docked</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    // Query from the dialog, as the sibling test above does: SheetContent
    // renders through a portal into document.body, so RTL's `container` never
    // holds the panel and a query rooted there returns null whatever the
    // variant renders.
    const panel = screen.getByRole("dialog");
    expect(panel.querySelector(".bg-muted-foreground\\/30")).toBeNull();
  });

  it("caps the bottom sheet with dvh and scrolls overflowing content internally", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Default</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole("dialog");
    // dvh, not vh: vh ignores the iOS dynamic toolbar, so a 90vh sheet can
    // poke under the browser chrome. dialog.tsx already uses 90dvh.
    expect(panel.className).toContain("max-h-[90dvh]");
    expect(panel.className).not.toContain("max-h-[90vh]");
    // Frame has overflow-hidden; inner wrapper has overflow-y-auto
    expect(panel.className).toContain("overflow-hidden");
    expect(panel.querySelector('[class*="overflow-y-auto"]')).not.toBeNull();
    // Close button is NOT inside the scroll wrapper
    expect(screen.getByRole("button", { name: /close/i }).closest('[class*="overflow-y-auto"]')).toBeNull();
  });

  it("scrolls side sheets internally too", () => {
    render(
      <Sheet open>
        <SheetContent side="right">
          <SheetTitle>Side</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole("dialog");
    // Frame has overflow-hidden; inner wrapper has overflow-y-auto
    expect(panel.className).toContain("overflow-hidden");
    expect(panel.querySelector('[class*="overflow-y-auto"]')).not.toBeNull();
    // Close button is NOT inside the scroll wrapper
    expect(screen.getByRole("button", { name: /close/i }).closest('[class*="overflow-y-auto"]')).toBeNull();
  });

  it("leaves the docked variant's scroll management to its content", () => {
    render(
      <Sheet open>
        <SheetContent side="docked" hideOverlay>
          <SheetTitle>Docked</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole("dialog");
    // Docked variant has NO inner scroll wrapper
    expect(panel.className).not.toContain("overflow-y-auto");
    expect(panel.querySelector('[class*="overflow-y-auto"]')).toBeNull();
  });

  it("fades the backdrop in over the same duration the panel slides", () => {
    // FP-05: tp-fade-in is 150ms, tp-slide-up is 250ms. Used together, the
    // backdrop finishes first and is visible on its own for 100ms.
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Default</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const overlay = document.querySelector(".backdrop-blur-sm");
    expect(overlay).not.toBeNull();
    expect(overlay!.className).toContain("data-[state=open]:tp-fade-in-sheet");
  });

  it("lets one caller neutralise the backdrop blur without losing the dim", () => {
    // FP-06: hideOverlay was all-or-nothing — there was no way to keep the
    // dim and drop the full-viewport blur.
    render(
      <Sheet open>
        <SheetContent overlayClassName="backdrop-blur-none">
          <SheetTitle>Default</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    // tailwind-merge resolves the conflict in the caller's favour.
    expect(document.querySelector(".backdrop-blur-none")).not.toBeNull();
    expect(document.querySelector(".backdrop-blur-sm")).toBeNull();
    // The dim itself is untouched.
    expect(document.querySelector(".bg-foreground\\/40")).not.toBeNull();
  });

  it("gives the docked panel a height floor", () => {
    // FP-13: min(37.5rem, calc(100vh - 9rem)) goes non-positive below a
    // 144px-tall viewport at md and up.
    render(
      <Sheet open>
        <SheetContent side="docked" hideOverlay>
          <SheetTitle>Docked</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.className).toContain("md:h-[min(37.5rem,max(16rem,calc(100vh-9rem)))]");
    expect(panel.className).not.toContain("md:h-[min(37.5rem,calc(100vh-9rem))]");
  });
});
