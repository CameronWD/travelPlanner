import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips/t1");
vi.mock("next/navigation", () => ({ usePathname: () => mockUsePathname(), useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({
    href,
    children,
    onNavigate,
    transitionTypes: _t,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children?: React.ReactNode;
    onNavigate?: (e: { preventDefault: () => void }) => void;
    transitionTypes?: unknown;
  }) => (
    <a href={href} onClick={(e) => { e.preventDefault(); onNavigate?.({ preventDefault() {} }); }} {...rest}>{children}</a>
  ),
}));

import { TabBar, type TabItem } from "./tab-bar";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending";

const items = [
  { href: "/trips/t1", label: "Home", match: (p: string) => p === "/trips/t1" },
  { href: "/trips/t1/plan", label: "Plan" },
];

function FakeIcon({ className, "aria-hidden": ariaHidden }: { className?: string; "aria-hidden"?: boolean | "true" }) {
  return <svg data-testid="fake-icon" className={className} aria-hidden={ariaHidden} />;
}

describe("TabBar", () => {
  it("lights the tapped tab before the URL changes (ADR 0063)", () => {
    render(<NavigationPendingProvider><TabBar items={items} /></NavigationPendingProvider>);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("link", { name: "Plan" }));
    const plan = screen.getByRole("link", { name: "Plan" });
    const home = screen.getByRole("link", { name: "Home" });
    // Lit and marked pending at once; aria-current stays on the page actually
    // shown until the new one has loaded.
    expect(plan).toHaveAttribute("data-pending", "true");
    expect(plan.className).toContain("font-extrabold");
    expect(plan).not.toHaveAttribute("aria-current");
    expect(home).toHaveAttribute("aria-current", "page");
    expect(home).not.toHaveAttribute("data-pending");
    expect(home.className).not.toContain("font-extrabold");
  });

  // Task 12 fix round 1: TabItem.icon is optional — the trip bar never passes
  // one (components/trip/mobile-tab-bar.test.tsx covers that it stays
  // icon-less), the app-level bar always does.
  it("renders an item's icon above its label when given one, and no svg when not", () => {
    const withIcon: TabItem[] = [
      { href: "/trips/t1", label: "Home", match: (p: string) => p === "/trips/t1", icon: FakeIcon },
      { href: "/trips/t1/plan", label: "Plan" },
    ];
    render(<TabBar items={withIcon} />);
    const home = screen.getByRole("link", { name: "Home" });
    const plan = screen.getByRole("link", { name: "Plan" });
    const icon = home.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(plan.querySelector("svg")).toBeNull();
  });
});
