import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MobileTabBar } from "./mobile-tab-bar";

// Use a vi.fn() so individual tests can override the return value per-test.
const mockUsePathname = vi.fn(() => "/trips/t1");

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

beforeEach(() => {
  // Reset to a base (non-More) route before each test.
  mockUsePathname.mockReturnValue("/trips/t1");
});

describe("MobileTabBar", () => {
  it("pads its bottom by the safe-area inset so it clears the home indicator", () => {
    const { container } = render(<MobileTabBar tripId="t1" />);
    const nav = container.querySelector("nav");
    expect(nav?.className).toContain("env(safe-area-inset-bottom)");
  });

  it("does NOT give the More button text-primary when a primary route is the current pathname", () => {
    // mockUsePathname already returns "/trips/t1" from beforeEach
    const { container } = render(<MobileTabBar tripId="t1" />);
    const buttons = container.querySelectorAll("button");
    const moreButton = Array.from(buttons).find(
      (b) => b.textContent?.trim() === "More",
    );
    expect(moreButton).toBeTruthy();
    // Base route (/trips/t1) is a primary tab, not a More sub-route → no text-primary
    expect(moreButton?.className).not.toContain("text-primary");
  });

  it("gives the More button text-primary when a More sub-route is the current pathname", () => {
    mockUsePathname.mockReturnValue("/trips/t1/settings");
    const { container } = render(<MobileTabBar tripId="t1" />);
    const buttons = container.querySelectorAll("button");
    const moreButton = Array.from(buttons).find(
      (b) => b.textContent?.trim() === "More",
    );
    expect(moreButton).toBeTruthy();
    expect(moreButton?.className).toContain("text-primary");
  });
});
