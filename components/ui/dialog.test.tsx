import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Field } from "./field";

function Example() {
  return (
    <Dialog>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite traveller</DialogTitle>
          <DialogDescription>Share this trip by email.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("does not render content when closed", () => {
    render(<Example />);
    expect(screen.queryByText("Invite traveller")).not.toBeInTheDocument();
  });

  it("opens on trigger click", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(
      await screen.findByRole("dialog"),
    ).toBeInTheDocument();
    expect(screen.getByText("Invite traveller")).toBeInTheDocument();
  });

  it("closes via the close button", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Invite traveller")).not.toBeInTheDocument();
  });

  it("closes on escape", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Invite traveller")).not.toBeInTheDocument();
  });

  it("keeps the close button outside the scrollable body", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");

    const close = screen.getByRole("button", { name: /close/i });
    expect(close).toBeInTheDocument();
    expect(close.closest('[class*="overflow-y-auto"]')).toBeNull();
  });

  it("is a bottom-sheet on mobile and a centered modal on desktop", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    const content = await screen.findByRole("dialog");

    expect(content.className).toContain("rounded-t-2xl");
    expect(content.className).toContain("sm:rounded-2xl");
  });

  it("caps the sheet height so a tall form scrolls within it", () => {
    render(
      <Dialog open>
        <DialogContent><DialogTitle>X</DialogTitle></DialogContent>
      </Dialog>,
    );
    const content = screen.getByRole("dialog");
    expect(content.className).toContain("max-h-[90dvh]");
  });

  it("renders a sticky header pinned to the top", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");

    const header = screen.getByText("Invite traveller").closest("div");
    expect(header?.className).toContain("sticky");
    expect(header?.className).toContain("top-0");
  });

  it("keeps scrolled content from ever showing through or above the pinned header", async () => {
    // jsdom has no layout engine, so this can't drive a real scroll and read
    // pixels back (see the fix-round-2 report for the in-browser scroll
    // verification). What it CAN pin is the structural invariants that make
    // "nothing peeks" true regardless of a browser's exact sticky-tracking
    // behaviour: the header paints above in-flow siblings (z-10) with an
    // opaque backdrop (bg-background), and is the scroll body's *first*
    // child, so nothing in document flow ever precedes it into the padding
    // strip above it.
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    const content = await screen.findByRole("dialog");

    const header = screen.getByText("Invite traveller").closest("[class*='sticky']") as HTMLElement;
    expect(header.className).toContain("z-10");
    expect(header.className).toContain("bg-background");

    const scrollBody = content.querySelector('[class*="overflow-y-auto"]') as HTMLElement;
    expect(scrollBody.firstElementChild).toBe(header);
  });

  it("gives the header breathing room below the title", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");

    const header = screen.getByText("Invite traveller").closest("div");
    // Breathing room is now a margin on the sticky header itself, not bottom
    // padding, and applies uniformly rather than differing by breakpoint.
    expect(header?.className).toContain("mb-1");
  });

  it("covers the top padding strip above the sticky header during iOS elastic overscroll", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");

    const header = screen.getByText("Invite traveller").closest("div");
    expect(header?.className).toContain("before:bg-background");
  });

  it("gives the scroll body sole ownership of the top inset — the header carries none of its own (LA-024)", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    const content = await screen.findByRole("dialog");

    // The header must not duplicate the scroll body's own top padding (that
    // doubled the visible inset), and must not cancel it with a negative
    // top margin either (that's what broke LA-024 — see dialog.tsx).
    const header = screen.getByText("Invite traveller").closest("[class*='sticky']") as HTMLElement;
    expect(header.className).not.toMatch(/(?<!-)\bpt-3\.5\b/);
    expect(header.className).not.toMatch(/sm:pt-6\b/);
    expect(header.className).not.toMatch(/-mt-3\.5|sm:-mt-6/);

    // The scroll body is the sole, uncancelled owner of the top inset.
    const scrollBody = content.querySelector('[class*="overflow-y-auto"]') as HTMLElement;
    expect(scrollBody.className).toMatch(/(?<!-)\bpt-3\.5\b/);
    expect(scrollBody.className).toMatch(/sm:pt-6\b/);
  });

  it("pads the scroll body for the mobile safe-area inset", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    const content = await screen.findByRole("dialog");

    const scrollBody = content.querySelector('[class*="overflow-y-auto"]');
    expect(scrollBody?.className).toContain("safe-area-inset-bottom");
  });

  it("header never shrinks under overflowing content", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");

    const header = screen.getByText("Invite traveller").closest("[class*='sticky']") as HTMLElement;
    expect(header.className).toContain("shrink-0");
  });

  it("centred dialog uses the shared dialog width", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    const content = await screen.findByRole("dialog");

    expect(content.className).toContain("sm:max-w-dialog");
  });
});

describe("DialogContent size", () => {
  function renderSize(size?: "md" | "lg") {
    render(
      <Dialog open>
        <DialogContent size={size}>
          <DialogTitle>X</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    return screen.getByRole("dialog");
  }

  it("defaults to the standard dialog width", () => {
    const content = renderSize(undefined);
    const classes = content.className.split(/\s+/);
    expect(classes).toContain("sm:max-w-dialog");
    expect(classes).not.toContain("sm:max-w-dialog-lg");
    expect(content.className).toContain("max-h-[90dvh]");
    expect(content.className).toContain("sm:max-h-[85vh]");
  });

  it('size="lg" swaps in the wide dialog width, keeping the sheet height caps', () => {
    const content = renderSize("lg");
    const classes = content.className.split(/\s+/);
    expect(classes).toContain("sm:max-w-dialog-lg");
    expect(classes).not.toContain("sm:max-w-dialog");
    expect(content.className).toContain("max-h-[90dvh]");
    expect(content.className).toContain("sm:max-h-[85vh]");
  });
});

describe("DialogFooter", () => {
  it("lays buttons side-by-side: equal halves on mobile, right-aligned on desktop, primary last in DOM", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Test</DialogTitle>
          <DialogFooter>
            <button>Cancel</button>
            <button>Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    const footer = screen.getByRole("button", { name: "Cancel" }).closest("div")!;
    // Row at all widths (not stacked).
    expect(footer.className).toContain("flex-row");
    expect(footer.className).not.toContain("flex-col");
    // Mobile: equal halves. Desktop: natural width, right-aligned.
    expect(footer.className).toContain("[&>*]:flex-1");
    expect(footer.className).toContain("sm:justify-end");
    expect(footer.className).toContain("sm:[&>*]:flex-initial");

    // DOM order preserved: Cancel precedes the primary action.
    const buttons = footer.querySelectorAll("button");
    expect(buttons[0]).toHaveTextContent("Cancel");
    expect(buttons[1]).toHaveTextContent("Save");
  });

  it("pins to the bottom of the scroll body so actions stay reachable on tall forms", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Test</DialogTitle>
          <DialogFooter>
            <button>Cancel</button>
            <button>Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    const footer = screen.getByRole("button", { name: "Cancel" }).closest("div")!;
    expect(footer.className).toContain("sticky");
    expect(footer.className).toContain("bottom-0");
    // Opaque, separated surface — content scrolling underneath must not show through.
    expect(footer.className).toContain("bg-background");
    // Cancels the scroll body's own bottom padding so the stuck footer sits flush.
    expect(footer.className).toContain("-mb-[calc(1.375rem+env(safe-area-inset-bottom))]");
  });

  it("covers the footer's negative-margin gap during iOS elastic overscroll", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Test</DialogTitle>
          <DialogFooter>
            <button>Cancel</button>
            <button>Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    const footer = screen.getByRole("button", { name: "Cancel" }).closest("div")!;
    expect(footer.className).toContain("after:bg-background");
  });

  it("scroll body carries scroll-pb-24 beside its sticky footer (the focus-reveal tests hold the real no-cover guarantee)", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Test</DialogTitle>
          <DialogFooter>
            <button>Cancel</button>
            <button>Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    const footer = screen.getByRole("button", { name: "Save" }).closest("div")!;
    expect(footer.className).toContain("sticky");
    const body = footer.parentElement as HTMLElement;
    expect(body.className).toContain("scroll-pb-24");
  });

  it("footer buttons wrap instead of overflowing a 360px sheet", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Test</DialogTitle>
          <DialogFooter>
            <button>Cancel</button>
            <button>Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    const footer = screen.getByRole("button", { name: "Save" }).closest("div")!;
    expect(footer.className).toContain("flex-wrap");
  });

  // LA-011 (Stage 2): scrolled to the end, the last field already clears the
  // footer (measured in-browser: 24px). The real leak is focus: a field that
  // peeks above the sticky footer counts as "visible" to the browser, so
  // focusing or tapping it scrolls nothing and it stays under the footer.
  function rect(top: number, bottom: number) {
    return { top, bottom, left: 0, right: 360, width: 360, height: bottom - top, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  }

  function renderForm() {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Stop</DialogTitle>
          </DialogHeader>
          <form>
            <label>
              Place
              <input />
            </label>
            <label>
              Notes
              <textarea />
            </label>
            <DialogFooter>
              <button type="button">Cancel</button>
              <button type="submit">Save</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>,
    );
    const footer = screen.getByRole("button", { name: "Save" }).parentElement as HTMLElement;
    const header = screen.getByText("Edit Stop").parentElement as HTMLElement;
    const body = header.parentElement as HTMLElement;
    const scrollBy = vi.fn();
    body.scrollBy = scrollBy as unknown as typeof body.scrollBy;
    header.getBoundingClientRect = () => rect(80, 152);
    footer.getBoundingClientRect = () => rect(744, 822);
    body.getBoundingClientRect = () => rect(80, 844);
    return { body, footer, header, scrollBy };
  }

  it("scrolls a focused field out from under the sticky footer", () => {
    const { scrollBy } = renderForm();
    const notes = screen.getByRole("textbox", { name: "Notes" });
    notes.getBoundingClientRect = () => rect(705, 801);

    fireEvent.focus(notes);

    // 801 - 744 = 57px under the footer, plus a 16px breathing gap.
    expect(scrollBy).toHaveBeenCalledWith({ top: 73 });
  });

  it("scrolls a focused field out from under the stuck header", () => {
    const { scrollBy } = renderForm();
    const place = screen.getByRole("textbox", { name: "Place" });
    place.getBoundingClientRect = () => rect(120, 170);

    fireEvent.focus(place);

    // Top at 120 is 32px under the header's 152 bottom, plus the 16px gap.
    expect(scrollBy).toHaveBeenCalledWith({ top: -48 });
  });

  it("leaves a field that already clears the footer where it is", () => {
    const { scrollBy } = renderForm();
    const notes = screen.getByRole("textbox", { name: "Notes" });
    notes.getBoundingClientRect = () => rect(600, 700);

    fireEvent.focus(notes);

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("never scrolls for the footer's own buttons", () => {
    const { scrollBy } = renderForm();
    const save = screen.getByRole("button", { name: "Save" });
    save.getBoundingClientRect = () => rect(756, 800);

    fireEvent.focus(save);

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("never pushes a tall field's top up under the header", () => {
    const { scrollBy } = renderForm();
    const notes = screen.getByRole("textbox", { name: "Notes" });
    // 700px tall: it cannot fit between header (152) and footer (744) at all,
    // so it scrolls only until its top sits 16px below the header (300 - 168).
    notes.getBoundingClientRect = () => rect(300, 1000);

    fireEvent.focus(notes);

    expect(scrollBy).toHaveBeenCalledWith({ top: 132 });
  });

  it("reveals the whole Field, trailing hint included, not just the focused control", () => {
    // Money → Add other cost at 360×500: the Cost input clears the footer on
    // focus, but its "Your best number…" hint renders *below* it (Field puts
    // description after children), so revealing only the input left the hint
    // under Cancel/Save.
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Other Cost</DialogTitle>
          </DialogHeader>
          <form>
            <Field label="Cost" description="Your best number.">
              <input aria-label="Cost amount" />
            </Field>
            <DialogFooter>
              <button type="button">Cancel</button>
              <button type="submit">Save</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>,
    );
    const footer = screen.getByRole("button", { name: "Save" }).parentElement as HTMLElement;
    const header = screen.getByText("Add Other Cost").parentElement as HTMLElement;
    const body = header.parentElement as HTMLElement;
    const scrollBy = vi.fn();
    body.scrollBy = scrollBy as unknown as typeof body.scrollBy;
    header.getBoundingClientRect = () => rect(80, 152);
    footer.getBoundingClientRect = () => rect(406, 484);
    body.getBoundingClientRect = () => rect(80, 506);

    const input = screen.getByRole("textbox", { name: "Cost amount" });
    // The input itself already clears the footer (390 < 406)…
    input.getBoundingClientRect = () => rect(346, 390);
    // …but its Field (label + input + hint) ends at 420.
    const fieldBox = screen.getByText("Your best number.").parentElement as HTMLElement;
    fieldBox.getBoundingClientRect = () => rect(320, 420);

    fireEvent.focus(input);

    // 420 - 406 = 14px under the footer, plus the 16px gap.
    expect(scrollBy).toHaveBeenCalledWith({ top: 30 });
  });
});
