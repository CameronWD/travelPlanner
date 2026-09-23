import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileTabBar } from "./mobile-tab-bar";

// Use a vi.fn() so individual tests can override the return value per-test.
const mockUsePathname = vi.fn(() => "/trips/t1");
const mockUseSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

beforeEach(() => {
  // Reset to a base (non-More) route before each test.
  mockUsePathname.mockReturnValue("/trips/t1");
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
});

describe("MobileTabBar", () => {
  it("pads its bottom by the safe-area inset so it clears the home indicator", () => {
    const { container } = render(<MobileTabBar tripId="t1" />);
    const nav = container.querySelector("nav");
    expect(nav?.className).toContain("env(safe-area-inset-bottom)");
  });

  it("does NOT give the More button its active styling when a primary route is the current pathname", () => {
    // mockUsePathname already returns "/trips/t1" from beforeEach
    const { container } = render(<MobileTabBar tripId="t1" />);
    const buttons = container.querySelectorAll("button");
    const moreButton = Array.from(buttons).find(
      (b) => b.textContent?.trim() === "More",
    );
    expect(moreButton).toBeTruthy();
    // Base route (/trips/t1) is a primary tab, not a More sub-route → inactive
    expect(moreButton?.className).not.toContain("text-on-accent");
    expect(moreButton?.getAttribute("aria-current")).toBeNull();
  });

  it("gives the More button its active styling when a More sub-route is the current pathname", () => {
    mockUsePathname.mockReturnValue("/trips/t1/settings");
    const { container } = render(<MobileTabBar tripId="t1" />);
    const buttons = container.querySelectorAll("button");
    const moreButton = Array.from(buttons).find(
      (b) => b.textContent?.trim() === "More",
    );
    expect(moreButton).toBeTruthy();
    expect(moreButton?.className).toContain("text-on-accent");
    expect(moreButton?.getAttribute("aria-current")).toBe("page");
  });

  it("publishes its height via --tp-tab-bar-h so the FAB and toasts can clear it", () => {
    render(<MobileTabBar tripId="t1" />);
    const nav = screen.getByRole("navigation", { name: "Trip sections" });
    expect(nav.className).toContain(
      "h-[calc(var(--tp-tab-bar-h)+env(safe-area-inset-bottom))]",
    );
  });

  // These eight routes have no other mobile entry point (see task-7 brief).
  it("reaches all eight More-only routes from the sheet", async () => {
    const user = userEvent.setup();
    render(<MobileTabBar tripId="t1" />);
    await user.click(screen.getByRole("button", { name: "More" }));

    const expected = [
      ["Summary", "/trips/t1/summary"],
      ["Wishlist", "/trips/t1/wishlist"],
      ["Journal", "/trips/t1/journal"],
      ["Checklists", "/trips/t1/checklists"],
      ["Files", "/trips/t1/files"],
      ["Activity", "/trips/t1/activity"],
      ["Settings", "/trips/t1/settings"],
      ["Help", "/trips/t1/help"],
    ];
    for (const [label, href] of expected) {
      expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(href);
    }
  });
});
