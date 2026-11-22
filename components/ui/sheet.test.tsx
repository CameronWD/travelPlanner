import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setMatchMedia } from "@/test/setup";
import { installVV, removeVV, runFramesSynchronously, setInnerHeight } from "@/test/helpers/visual-viewport";
import { Sheet, SheetContent, SheetTitle, SheetTrigger, sheetVariants } from "./sheet";
import { Checkbox } from "./checkbox";
import { nearestPositionedAncestor } from "@/test/helpers/containing-block";

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
    expect(panel.querySelector('[aria-hidden="true"].bg-border')).not.toBeNull();
  });

  it("docks to the bottom right from md up and hugs the bottom edge below it", () => {
    render(
      <Sheet open>
        <SheetContent side="docked" hideOverlay>
          <SheetTitle>Docked</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.className).toContain("inset-x-0");
    expect(panel.className).toContain("bottom-0");
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
    expect(panel.querySelector('[aria-hidden="true"].bg-border')).toBeNull();
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

  it("LA-023: docked feedback sheet sizes to content on desktop", () => {
    // The docked panel used to force a tall fixed height on desktop even when
    // its content (e.g. an empty feedback log) only filled a third of it,
    // leaving a big blank void. It now sizes to its content, capped so it
    // never grows past the viewport — and (M-13, the FP-13 floor) the cap
    // never drops below 16rem on a very short window, so a tall log still
    // gets a usable scroll box instead of a sliver.
    expect(sheetVariants({ side: "docked" })).toContain("md:h-auto");
    expect(sheetVariants({ side: "docked" })).toContain(
      "md:max-h-[min(37.5rem,max(16rem,calc(100vh-9rem)))]",
    );
    expect(sheetVariants({ side: "docked" })).not.toContain(
      "md:h-[min(37.5rem,max(16rem,calc(100vh-9rem)))]",
    );

    render(
      <Sheet open>
        <SheetContent side="docked" hideOverlay>
          <SheetTitle>Docked</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.className).toContain("md:h-auto");
    expect(panel.className).toContain("md:max-h-[min(37.5rem,max(16rem,calc(100vh-9rem)))]");
  });

  it("LA-023 mobile: below md the docked sheet is a bottom sheet sized to its content", () => {
    // It used to be a full-screen panel (inset-0 h-full) on phones, so an
    // empty feedback log left a screen-tall void between the title and the
    // write box. Below md it now hugs the bottom edge, grows with content and
    // stops at 90dvh; the md: desktop card is untouched. A caller that wants
    // the phone filled (the Feedback panel) says so on its own className.
    const classes = sheetVariants({ side: "docked" }).split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining(["inset-x-0", "bottom-0", "h-auto", "max-h-[90dvh]", "rounded-t-2xl", "border-t-2"]),
    );
    expect(classes).not.toContain("inset-0");
    expect(classes).not.toContain("h-full");
    // Desktop card stays as Task 10 left it.
    expect(classes).toEqual(
      expect.arrayContaining(["md:inset-auto", "md:bottom-[5.25rem]", "md:right-4", "md:h-auto", "md:rounded-2xl", "md:border-2"]),
    );
  });

  // Same frame/body structure as dialog.tsx, so the same fix (spec
  // 2026-10-04 §G): an sr-only control's focus scroll must move the body,
  // never the frame.
  it.each(["bottom", "right", "left"] as const)(
    "anchors absolutely positioned controls to the %s sheet's scroll body, and clips its frame without scrolling it",
    (side) => {
      render(
        <Sheet open>
          <SheetContent side={side}>
            <SheetTitle>Filters</SheetTitle>
            <Checkbox label="Only booked" />
          </SheetContent>
        </Sheet>,
      );
      const panel = screen.getByRole("dialog");
      const body = panel.querySelector<HTMLElement>('[class*="overflow-y-auto"]');
      expect(nearestPositionedAncestor(screen.getByRole("checkbox", { name: "Only booked" }))).toBe(body);
      const classes = panel.className.split(/\s+/);
      expect(classes).toContain("overflow-hidden");
      expect(classes).toContain("supports-[overflow:clip]:overflow-clip");
    },
  );
});

// ---------------------------------------------------------------------------
// Phone keyboard (spec 2026-10-11-phone-keyboard-sheets)
// ---------------------------------------------------------------------------

describe("Sheet: phone keyboard (spec 2026-10-11-phone-keyboard-sheets)", () => {
  let frames: ReturnType<typeof runFramesSynchronously>;
  beforeEach(() => {
    setMatchMedia(false); // phone: below sm and md
    setInnerHeight(844);
    frames = runFramesSynchronously();
  });
  afterEach(() => {
    removeVV();
    frames.mockRestore();
  });

  function openSheet(side: "bottom" | "docked" | "right" | "left") {
    render(
      <Sheet open>
        <SheetContent side={side} hideOverlay={side === "docked"} className={side === "docked" ? "pb-[calc(1.5rem+env(safe-area-inset-bottom))]" : undefined}>
          <SheetTitle>Add thing to do</SheetTitle>
          <textarea aria-label="Notes" />
        </SheetContent>
      </Sheet>,
    );
    return screen.getByRole("dialog");
  }

  const handleOf = (panel: HTMLElement) => panel.querySelector<HTMLElement>('[aria-hidden="true"].bg-border');
  // Radix sets its own pointer-events inline, so check the keyboard properties, not the whole attribute.
  function expectNoKeyboardStyle(panel: HTMLElement) {
    expect(panel.style.bottom).toBe("");
    expect(panel.style.maxHeight).toBe("");
    expect(panel.style.height).toBe("");
  }
  const bodyOf = (panel: HTMLElement) => panel.querySelector<HTMLElement>('[class*="overflow-y-auto"]');
  const backing = () => document.querySelector<HTMLElement>('[data-slot="keyboard-backing"]');

  it("bottom, keyboard open: a backing in the sheet's colour fills from its bottom edge to the bottom of the screen", () => {
    installVV(500, 120);
    const panel = openSheet("bottom");
    const el = backing()!;
    expect(el).toHaveAttribute("aria-hidden", "true");
    // As tall as the sheet is lifted: both are percentages of the same viewport.
    expect(el.style.height).toBe("calc(100% - 620px)");
    expect(el.className.split(/\s+/)).toEqual(expect.arrayContaining(["fixed", "inset-x-0", "bottom-0", "z-50", "bg-background"]));
    // Same portal, painted above the overlay and under the sheet.
    const overlay = document.querySelector(".backdrop-blur-sm")!;
    expect(overlay.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(el.nextElementSibling).toBe(panel);
  });

  it("docked below md, keyboard open: backed too", () => {
    installVV(500, 0);
    openSheet("docked");
    expect(backing()).toHaveAttribute("aria-hidden", "true");
    expect(backing()!.style.height).toBe("calc(100% - 500px)");
  });

  it("bottom, keyboard open: sits on the keyboard, hides the handle, drops the safe-area padding", () => {
    installVV(500, 120);
    const panel = openSheet("bottom");
    expect(panel).toHaveAttribute("data-keyboard", "open");
    expect(panel.style.bottom).toBe("calc(100% - 620px)");
    expect(panel.style.maxHeight).toBe("500px");
    expect(panel.style.height).toBe("");
    expect(panel.className).toContain("group/sheet");
    expect(handleOf(panel)!.className).toContain("group-data-[keyboard=open]/sheet:hidden");
    expect(bodyOf(panel)!.className).toContain("group-data-[keyboard=open]/sheet:pb-6");
  });

  it("bottom: follows the keyboard closing and reopening", () => {
    const vv = installVV(844, 0);
    const panel = openSheet("bottom");
    expect(panel).not.toHaveAttribute("data-keyboard");
    act(() => {
      vv.height = 450;
      vv.offsetTop = 40;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(panel).toHaveAttribute("data-keyboard", "open");
    expect(panel.style.bottom).toBe("calc(100% - 490px)");
    expect(panel.style.maxHeight).toBe("450px");
    expect(backing()!.style.height).toBe("calc(100% - 490px)");
    act(() => {
      vv.height = 844;
      vv.offsetTop = 0;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(panel).not.toHaveAttribute("data-keyboard");
    expectNoKeyboardStyle(panel);
    expect(backing()).toBeNull();
  });

  it("bottom, keyboard closed: today's classes, no inline style", () => {
    installVV(844, 0);
    const panel = openSheet("bottom");
    expect(panel).not.toHaveAttribute("data-keyboard");
    expectNoKeyboardStyle(panel);
    expect(panel.className).toContain("max-h-[90dvh]");
    expect(backing()).toBeNull();
  });

  it("docked below md, keyboard open: same geometry, safe-area padding dropped", () => {
    installVV(500, 0);
    const panel = openSheet("docked");
    expect(panel).toHaveAttribute("data-keyboard", "open");
    expect(panel.style.bottom).toBe("calc(100% - 500px)");
    expect(panel.style.maxHeight).toBe("500px");
    expect(panel.style.height).toBe("500px");
    expect(panel.className.split(/\s+/)).toContain("pb-6");
    expect(panel.className).not.toContain("safe-area-inset-bottom");
  });

  it("docked at md+ (desktop card): no inline style, no attribute, classes unchanged", () => {
    setMatchMedia((query) => query === "(min-width: 640px)" || query === "(min-width: 768px)");
    installVV(500, 0);
    const panel = openSheet("docked");
    expect(panel).not.toHaveAttribute("data-keyboard");
    expectNoKeyboardStyle(panel);
    expect(panel.className).not.toContain("group/sheet");
    expect(panel.className).toContain("pb-[calc(1.5rem+env(safe-area-inset-bottom))]");
    expect(backing()).toBeNull();
  });

  it.each(["right", "left"] as const)("%s sheets never react to the keyboard", (side) => {
    installVV(500, 0);
    const panel = openSheet(side);
    expect(panel).not.toHaveAttribute("data-keyboard");
    expectNoKeyboardStyle(panel);
    expect(panel.className).not.toContain("group/sheet");
    expect(backing()).toBeNull();
  });

  it("reopening a sheet closed with the keyboard open starts clean", async () => {
    const user = userEvent.setup();
    const vv = installVV(500, 0);
    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetTitle>More</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByRole("dialog")).toHaveAttribute("data-keyboard", "open");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    vv.height = 844; // keyboard went away while closed — no event reaches the sheet
    await user.click(screen.getByRole("button", { name: "Open" }));
    const reopened = await screen.findByRole("dialog");
    expect(reopened).not.toHaveAttribute("data-keyboard");
    expectNoKeyboardStyle(reopened);
  });
});

describe("Sheet: the page behind a phone sheet stays still", () => {
  function Example({ side = "bottom", modal }: { side?: "bottom" | "docked"; modal?: boolean }) {
    return (
      <Sheet modal={modal}>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent side={side} hideOverlay={modal === false} aria-describedby={undefined}>
          <SheetTitle>Feedback</SheetTitle>
        </SheetContent>
      </Sheet>
    );
  }

  it.each(["bottom", "docked"] as const)("a modal %s sheet below md fixes the body, over Radix's own lock, until it closes", async (side) => {
    setMatchMedia(false);
    const user = userEvent.setup();
    render(<Example side={side} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    expect(document.body).toHaveAttribute("data-scroll-locked");
    expect(getComputedStyle(document.body).position).toBe("fixed");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.position).toBe("");
  });

  it("the md+ docked card (non-modal) leaves the page alone", async () => {
    setMatchMedia((query) => query === "(min-width: 640px)" || query === "(min-width: 768px)");
    const user = userEvent.setup();
    render(<Example side="docked" modal={false} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    expect(document.body.style.position).toBe("");
  });

  it("a non-modal sheet below md leaves the page alone", async () => {
    setMatchMedia(false);
    const user = userEvent.setup();
    render(<Example modal={false} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    expect(document.body.style.position).toBe("");
  });

  it("from md up a modal sheet does not lock either", async () => {
    setMatchMedia((query) => query === "(min-width: 640px)" || query === "(min-width: 768px)");
    const user = userEvent.setup();
    render(<Example side="docked" />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    expect(document.body.style.position).toBe("");
  });
});

describe("Sheet: a sheet opened from a sheet covers it", () => {
  function Nested({ innerSide = "bottom" }: { innerSide?: "bottom" | "right" }) {
    return (
      <Sheet open>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Outer</SheetTitle>
          <Sheet open>
            <SheetContent side={innerSide} aria-describedby={undefined}>
              <SheetTitle>Inner</SheetTitle>
            </SheetContent>
          </Sheet>
        </SheetContent>
      </Sheet>
    );
  }
  const frame = (title: string) =>
    [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.querySelector("h2")?.textContent === title)!;

  it("a bottom sheet inside another sheet's content is at least 90dvh tall; the first one is not", () => {
    render(<Nested />);
    expect(frame("Inner").className.split(/\s+/)).toContain("min-h-[90dvh]");
    expect(frame("Outer").className).not.toContain("min-h-");
  });

  it("only bottom sheets take the floor", () => {
    render(<Nested innerSide="right" />);
    expect(frame("Inner").className).not.toContain("min-h-");
  });

  it("drops the floor while the phone keyboard is open", () => {
    setMatchMedia(false);
    setInnerHeight(844);
    const raf = runFramesSynchronously();
    installVV(500, 0);
    try {
      render(<Nested />);
      expect(frame("Inner")).toHaveAttribute("data-keyboard", "open");
      expect(frame("Inner").className).not.toContain("min-h-");
    } finally {
      removeVV();
      raf.mockRestore();
    }
  });

  it("the scroll body can never be panned sideways, nor hand a sideways pan on to the page", () => {
    render(
      <Sheet open>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Default</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const body = screen.getByRole("dialog").querySelector<HTMLElement>('[class*="overflow-y-auto"]')!;
    expect(body.className.split(/\s+/)).toEqual(expect.arrayContaining(["overflow-x-hidden", "overscroll-x-none"]));
  });
});
