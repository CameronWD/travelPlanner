import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("scroll body reserves room so the sticky footer never covers the last field", () => {
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
});
