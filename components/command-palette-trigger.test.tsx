import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPaletteTrigger } from "./command-palette-trigger";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CommandPaletteTrigger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders accessible buttons with the correct aria-label", () => {
    render(<CommandPaletteTrigger />);
    const btns = screen.getAllByRole("button", { name: /search/i });
    // Expect at least one (mobile icon + desktop pill)
    expect(btns.length).toBeGreaterThanOrEqual(1);
    btns.forEach((btn) => {
      expect(btn).toHaveAttribute("aria-label", "Search (⌘K)");
    });
  });

  it("dispatches teepee:open-palette event on click", async () => {
    const user = userEvent.setup();
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<CommandPaletteTrigger />);
    // Click the first button (mobile icon button)
    const btn = screen.getAllByRole("button", { name: /search/i })[0];
    await user.click(btn);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "teepee:open-palette" }),
    );
  });

  it("renders the 'Search or jump…' pill text (desktop label)", () => {
    render(<CommandPaletteTrigger />);
    // The text should be in the DOM (hidden on mobile via responsive classes)
    expect(screen.getByText("Search or jump…")).toBeInTheDocument();
  });

  it("renders the ⌘K kbd chip", () => {
    render(<CommandPaletteTrigger />);
    const kbd = screen.getByText("⌘K");
    expect(kbd.tagName).toBe("KBD");
  });

  it("the pill text is aria-hidden so it doesn't duplicate the button label", () => {
    render(<CommandPaletteTrigger />);
    const pillText = screen.getByText("Search or jump…");
    expect(pillText).toHaveAttribute("aria-hidden", "true");
  });
});
