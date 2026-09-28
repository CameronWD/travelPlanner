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

import { TabBar } from "./tab-bar";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending";

const items = [
  { href: "/trips/t1", label: "Home", match: (p: string) => p === "/trips/t1" },
  { href: "/trips/t1/plan", label: "Plan" },
];

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
});
