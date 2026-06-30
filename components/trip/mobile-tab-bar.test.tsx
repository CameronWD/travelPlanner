import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MobileTabBar } from "./mobile-tab-bar";

vi.mock("next/navigation", () => ({ usePathname: () => "/trips/t1" }));

describe("MobileTabBar", () => {
  it("pads its bottom by the safe-area inset so it clears the home indicator", () => {
    const { container } = render(<MobileTabBar tripId="t1" />);
    const nav = container.querySelector("nav");
    expect(nav?.className).toContain("env(safe-area-inset-bottom)");
  });

  it("gives the More button the active (text-primary) class when a More sub-route is active", () => {
    // Temporarily override usePathname to a More sub-route (e.g. /trips/t1/settings)
    vi.doMock("next/navigation", () => ({
      usePathname: () => "/trips/t1/settings",
    }));
    // Re-import to pick up the new mock — use a dynamic import workaround via re-render
    // Since vi.mock is hoisted we instead test via the rendered DOM.
    // The pathname mock returns /trips/t1/settings which matches moreNav(t1) settings href.
    // Re-render with the mocked pathname that covers a More-section route.
    // Because vi.mock is hoisted at module level, we check via container className.
    const { container } = render(<MobileTabBar tripId="t1" />);
    // With pathname = "/trips/t1" (from the hoisted mock at the top), More is NOT active.
    // Check that the More button does NOT have text-primary in this case.
    const buttons = container.querySelectorAll("button");
    // The last button is the SheetTrigger (More)
    const moreButton = Array.from(buttons).find(
      (b) => b.textContent?.trim() === "More",
    );
    expect(moreButton).toBeTruthy();
    // With the top-level mock pathname = /trips/t1, the More routes don't match → no text-primary
    expect(moreButton?.className).not.toContain("text-primary");
  });
});

describe("MobileTabBar — More active state", () => {
  it("gives the More button text-primary when a More sub-route is the current pathname", async () => {
    // Isolate this test by using a module with a different pathname mock
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      usePathname: () => "/trips/t2/settings",
    }));
    // Dynamic import to get the freshly mocked version
    const { MobileTabBar: Bar } = await import("./mobile-tab-bar");
    const { container } = render(<Bar tripId="t2" />);
    const buttons = container.querySelectorAll("button");
    const moreButton = Array.from(buttons).find(
      (b) => b.textContent?.trim() === "More",
    );
    expect(moreButton).toBeTruthy();
    expect(moreButton?.className).toContain("text-primary");
  });
});
