import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./page-header";

describe("PageHeader (AUDIT.md §1)", () => {
  it("renders the title as the only heading, an h1, with the eyebrow above it", () => {
    render(<PageHeader eyebrow="Christmas in Europe" title="Money" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Money" });
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    for (const c of ["font-display", "font-extrabold", "text-[32px]", "md:text-[40px]", "tracking-[-0.02em]"]) {
      expect(h1.className.split(/\s+/)).toContain(c);
    }
    const eyebrow = screen.getByText("Christmas in Europe");
    expect(eyebrow.tagName).toBe("P");
    expect(eyebrow.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hides the meta line on phones unless metaOnMobile", () => {
    const { rerender } = render(<PageHeader title="Files" meta="3 files" />);
    expect(screen.getByText("3 files").className.split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "md:block"]));
    rerender(<PageHeader title="Files" meta="3 files" metaOnMobile />);
    expect(screen.getByText("3 files").className.split(/\s+/)).not.toContain("hidden");
  });

  it("puts actions in an md+ cluster and the mobile action in a phone-only slot", () => {
    render(
      <PageHeader
        title="Money"
        actions={<button type="button">Add a cost</button>}
        mobileAction={<button type="button" aria-label="Add a cost (phone)" />}
      />,
    );
    const desktop = screen.getByRole("button", { name: "Add a cost" }).closest("[data-slot='page-header-actions']")!;
    expect(desktop.className.split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "md:flex"]));
    const phone = screen.getByRole("button", { name: "Add a cost (phone)" }).closest("[data-slot='page-header-mobile-action']")!;
    expect(phone.className.split(/\s+/)).toContain("md:hidden");
  });

  it("renders trailing once, at every width, before the actions", () => {
    render(
      <PageHeader title="Money" trailing={<span data-testid="bell" />} actions={<button type="button">Add</button>} />,
    );
    expect(screen.getAllByTestId("bell")).toHaveLength(1);
    const bell = screen.getByTestId("bell");
    expect(bell.closest("[data-slot='page-header-actions']")).toBeNull();
    expect(bell.compareDocumentPosition(screen.getByRole("button", { name: "Add" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders no empty slots", () => {
    const { container } = render(<PageHeader title="More" />);
    expect(container.querySelector("[data-slot='page-header-side']")).toBeNull();
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("uses no soft-style classes", () => {
    const { container } = render(<PageHeader eyebrow="Trip" title="X" meta="m" actions={<span />} trailing={<span />} />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });

  it("stacks into two rows below md: trailing cluster first, then the title beside the phone action (spec 2026-10-12 W1, ruling R1)", () => {
    const { container } = render(
      <PageHeader
        eyebrow="EU Christmas 2026"
        title="Wishlist"
        trailing={<span data-testid="bell" />}
        actions={<button type="button">Add an idea</button>}
        mobileAction={<button type="button" aria-label="Add an idea (phone)" />}
      />,
    );
    const header = container.querySelector("[data-slot='page-header']")!;
    expect(header.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["grid", "grid-cols-[minmax(0,1fr)_auto]", "md:flex", "md:flex-wrap", "md:items-end"]),
    );
    const trailing = container.querySelector("[data-slot='page-header-trailing']")!;
    const title = container.querySelector("[data-slot='page-header-title']")!;
    const mobile = container.querySelector("[data-slot='page-header-mobile-action']")!;
    // Row 1: the layout cluster, full width, right-aligned. Row 2: title left, + right.
    expect(trailing.className.split(/\s+/)).toEqual(expect.arrayContaining(["row-start-1", "col-span-2", "justify-end", "md:contents"]));
    expect(title.className.split(/\s+/)).toEqual(expect.arrayContaining(["row-start-2", "col-start-1", "min-w-0", "md:flex-1", "md:min-w-[14rem]"]));
    expect(mobile.className.split(/\s+/)).toEqual(expect.arrayContaining(["row-start-2", "col-start-2", "md:hidden"]));
    // The title column holds no focusable control, so DOM order title → side (trailing, then +)
    // already matches the visual rows for keyboard users; assert the + follows the trailing cluster.
    expect(trailing.compareDocumentPosition(mobile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // From md the side cluster is one flex unit that wraps under the title as a group, right-aligned,
    // and wraps within itself when even a full row cannot hold it (768: no sideways scroll).
    const side = container.querySelector("[data-slot='page-header-side']")!;
    expect(side.className.split(/\s+/)).toEqual(expect.arrayContaining(["contents", "md:flex", "md:flex-wrap", "md:ml-auto", "md:justify-end"]));
  });

  it("keeps the title on the first row when there is no trailing cluster", () => {
    const { container } = render(<PageHeader title="More" mobileAction={<button type="button" aria-label="Add" />} />);
    expect(container.querySelector("[data-slot='page-header-title']")!.className.split(/\s+/)).toContain("row-start-1");
    expect(container.querySelector("[data-slot='page-header-mobile-action']")!.className.split(/\s+/)).toContain("row-start-1");
    expect(container.querySelector("[data-slot='page-header-trailing']")).toBeNull();
  });

  it("never breaks the h1 inside a word, and truncates a long eyebrow with a title", () => {
    render(<PageHeader eyebrow="EU Christmas 2026 and the long way home again" title="Compare plans" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Compare plans" });
    expect(h1.className.split(/\s+/)).toContain("[overflow-wrap:normal]");
    expect(h1.className).not.toMatch(/break-words|break-all|overflow-wrap:anywhere|word-break/);
    const eyebrow = screen.getByText("EU Christmas 2026 and the long way home again");
    expect(eyebrow.className.split(/\s+/)).toContain("truncate");
    expect(eyebrow).toHaveAttribute("title", "EU Christmas 2026 and the long way home again");
  });
});
