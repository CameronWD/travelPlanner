import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPaletteTrigger } from "./command-palette-trigger";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CommandPaletteTrigger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders accessible buttons whose names contain their visible text", () => {
    render(<CommandPaletteTrigger />);
    const btns = screen.getAllByRole("button", { name: /search/i });
    // Mobile icon + desktop pill
    expect(btns.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    // Label-in-name: the pill's accessible name is its visible text.
    expect(screen.getByRole("button", { name: "Search or jump…" })).toBeInTheDocument();
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

  it("has no ⌘K keycap — the shortcut lives in the tooltip", () => {
    vi.stubGlobal("navigator", { ...navigator, platform: "Win32", userAgent: "Windows NT 10.0" });
    const { container } = render(<CommandPaletteTrigger />);
    expect(screen.queryByText("⌘K")).not.toBeInTheDocument();
    expect(container.querySelector("kbd")).toBeNull();
    for (const btn of screen.getAllByRole("button")) {
      expect(btn).toHaveAttribute("title", "Search (Ctrl K)");
    }
  });
});
