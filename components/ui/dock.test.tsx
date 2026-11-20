import type { Route } from "next";
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stripped so it never reaches the DOM
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
  { href: "/trips/t1" as Route, label: "Home", match: (p: string) => p === "/trips/t1" },
  { href: "/trips/t1/plan" as Route, label: "Plan" },
];

describe("Dock", () => {
  it("is the rail surface, and its lit item carries dark ink (K2)", () => {
    render(<NavigationPendingProvider><Dock items={items} aria-label="Sections" /></NavigationPendingProvider>);
    const classes = screen.getByRole("navigation").className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["rail", "bg-rail"]));
    expect(classes).not.toContain("bg-sun");
    expect(screen.getByRole("link", { name: "Home" }).className.split(/\s+/)).toContain("text-on-accent");
    expect(screen.getByRole("link", { name: "Plan" }).className.split(/\s+/)).not.toContain("text-on-accent");
  });

  it("lights the tapped item before the URL changes (ADR 0063)", () => {
    render(<NavigationPendingProvider><Dock items={items} /></NavigationPendingProvider>);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("link", { name: "Plan" }));
    const plan = screen.getByRole("link", { name: "Plan" });
    const home = screen.getByRole("link", { name: "Home" });
    // Lit and marked pending at once; aria-current stays on the page actually
    // shown until the new one has loaded.
    expect(plan).toHaveAttribute("data-pending", "true");
    expect(plan.className).toContain("bg-coral");
    expect(plan).not.toHaveAttribute("aria-current");
    expect(home).toHaveAttribute("aria-current", "page");
    expect(home).not.toHaveAttribute("data-pending");
    expect(home.className).not.toContain("bg-coral");
  });

  it("renders two items that share a page without a duplicate-key warning", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const same = [{ href: "/trips/t1/plan" as Route, label: "Plan" }, { href: "/trips/t1/plan" as Route, label: "Days" }];
    render(<NavigationPendingProvider><Dock items={same} aria-label="Sections" /></NavigationPendingProvider>);
    expect(screen.getByRole("link", { name: "Plan" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Days" })).toBeTruthy();
    expect(spy.mock.calls.flat().join(" ")).not.toContain("same key");
    spy.mockRestore();
  });
});
