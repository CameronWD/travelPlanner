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
    expect(panel.className).toContain("overflow-y-auto");
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
    expect(panel.className).toContain("overflow-y-auto");
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
    expect(panel.className).not.toContain("overflow-y-auto");
  });
});
