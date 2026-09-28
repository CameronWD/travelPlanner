import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips/t1");
vi.mock("next/navigation", () => ({ usePathname: () => mockUsePathname(), useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
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

import { Dock } from "./dock";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending";

const items = [
  { href: "/trips/t1", label: "Home", match: (p: string) => p === "/trips/t1" },
  { href: "/trips/t1/plan", label: "Plan" },
];

describe("Dock", () => {
  it("lights the tapped item before the URL changes (ADR 0063)", () => {
    render(<NavigationPendingProvider><Dock items={items} /></NavigationPendingProvider>);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("link", { name: "Plan" }));
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });
});
