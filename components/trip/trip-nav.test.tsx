import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripNav, primaryNav, moreNav, isNavActive, isDaysActive } from "./trip-nav";

// Use a vi.fn() so individual tests can override the return value per-test.
const mockUsePathname = vi.fn(() => "/trips/t1");
const mockUseSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children?: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/trip/nav-more-menu", () => ({
  NavMoreMenu: () => <div data-testid="nav-more-menu" />,
}));

beforeEach(() => {
  mockUsePathname.mockReturnValue("/trips/t1");
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
});

describe("TripNav", () => {
  // Playground's Dock marks the active rail item with a coral "sticker"
  // (border + bg-coral + shadow), not the old horizontal bar's text-primary
  // colour + underline span — see components/ui/dock.tsx.
  it("gives the active rail item the coral sticker", () => {
    // Pathname matches the Home item (/trips/t1)
    mockUsePathname.mockReturnValue("/trips/t1");
    const { container } = render(<TripNav tripId="t1" />);
    // The active link is the one with aria-current="page"
    const activeLink = container.querySelector('[aria-current="page"]');
    expect(activeLink).toBeTruthy();
    expect(activeLink?.className).toContain("bg-coral");
  });

  it("does NOT give inactive rail items the coral sticker", () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    const { container } = render(<TripNav tripId="t1" />);
    const inactiveLinks = container.querySelectorAll(
      'a:not([aria-current="page"])',
    );
    // There should be some inactive links
    expect(inactiveLinks.length).toBeGreaterThan(0);
    inactiveLinks.forEach((link) => {
      expect(link.className).not.toContain("bg-coral");
    });
  });

  it("gives Home aria-current=page on the trip base path, and no other item", () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    const { container, getByText } = render(<TripNav tripId="t1" />);
    const current = container.querySelectorAll('[aria-current="page"]');
    expect(current.length).toBe(1);
    expect(getByText("Home").getAttribute("aria-current")).toBe("page");
  });

  it("gives Plan aria-current=page on the plan route, and not Home", () => {
    // Home's base path (/trips/t1) is a prefix of every other trip route —
    // isNavActive's exact-match rule is what keeps Home from also lighting up.
    mockUsePathname.mockReturnValue("/trips/t1/plan");
    const { getByText } = render(<TripNav tripId="t1" />);
    expect(getByText("Plan").getAttribute("aria-current")).toBe("page");
    expect(getByText("Home").getAttribute("aria-current")).toBeNull();
  });

  // Named for the reason, not the mechanism: losing this silently drops a
  // Traveller working in a fork back to the real plan (ADR 0020) — the UI
  // gives no other sign it happened.
  it("keeps a fork's ?plan= alive across navigation, in the Plan and Money hrefs but not Days", () => {
    mockUsePathname.mockReturnValue("/trips/t1/plan");
    mockUseSearchParams.mockReturnValue(new URLSearchParams("plan=abc"));
    const { getByText } = render(<TripNav tripId="t1" />);
    expect(getByText("Plan").getAttribute("href")).toBe("/trips/t1/plan?plan=abc");
    expect(getByText("Money").getAttribute("href")).toBe("/trips/t1/budget?plan=abc");
    expect(getByText("Days").getAttribute("href")).toBe("/trips/t1/calendar");
  });

  it("carries ?plan= on plan-scoped surfaces only", () => {
    const hrefs = Object.fromEntries(
      [...primaryNav("t1", "fork-9"), ...moreNav("t1", "fork-9")].map((i) => [i.label, i.href]),
    );
    expect(hrefs["Plan"]).toBe("/trips/t1/plan?plan=fork-9");
    expect(hrefs["Money"]).toBe("/trips/t1/budget?plan=fork-9");
    expect(hrefs["Wishlist"]).toBe("/trips/t1/wishlist?plan=fork-9");
    expect(hrefs["Days"]).toBe("/trips/t1/calendar");
    expect(hrefs["Summary"]).toBe("/trips/t1/summary");
    expect(hrefs["Home"]).toBe("/trips/t1");
  });

  it("stays active when the href carries a query string", () => {
    expect(isNavActive("/trips/t1/plan?plan=fork-9", "/trips/t1/plan", "/trips/t1")).toBe(true);
  });

  it("includes Help in the More menu without a ?plan= param", () => {
    const hrefs = Object.fromEntries(
      moreNav("t1", "fork-9").map((i) => [i.label, i.href]),
    );
    // Help is not plan-scoped — the guide is the same for every plan.
    expect(hrefs["Help"]).toBe("/trips/t1/help");
  });

  it("puts Help last in the More menu", () => {
    const labels = moreNav("t1").map((i) => i.label);
    expect(labels[labels.length - 1]).toBe("Help");
  });

  it("has no Today entry — Home is the Today view while Travelling (ADR 0010)", () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    const { container } = render(<TripNav tripId="t1" />);
    expect(container.querySelector('a[href="/trips/t1/today"]')).toBeNull();
    expect(screen.queryByText("Today")).toBeNull();
  });

  it("gives Days aria-current=page on a single day page", () => {
    mockUsePathname.mockReturnValue("/trips/t1/day/2026-12-04");
    render(<TripNav tripId="t1" />);
    expect(screen.getByRole("link", { name: "Days" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("isDaysActive matches /day and /day/… but not a sibling route that merely starts with 'day'", () => {
    expect(isDaysActive("/trips/t1/calendar", "/trips/t1/day/2026-12-04", "/trips/t1")).toBe(true);
    expect(isDaysActive("/trips/t1/calendar", "/trips/t1/day", "/trips/t1")).toBe(true);
    expect(isDaysActive("/trips/t1/calendar", "/trips/t1/calendar", "/trips/t1")).toBe(true);
    expect(isDaysActive("/trips/t1/calendar", "/trips/t1/daybook", "/trips/t1")).toBe(false);
    expect(isDaysActive("/trips/t1/calendar", "/trips/t1/plan", "/trips/t1")).toBe(false);
  });
});
