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
});
