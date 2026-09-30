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
});
