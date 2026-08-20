import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { TripNav, primaryNav, moreNav, isNavActive } from "./trip-nav";

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
  it("gives the active tab label text-primary (coral)", () => {
    // Pathname matches the Home tab (/trips/t1)
    mockUsePathname.mockReturnValue("/trips/t1");
    const { container } = render(<TripNav tripId="t1" />);
    // The active link is the one with aria-current="page"
    const activeLink = container.querySelector('[aria-current="page"]');
    expect(activeLink).toBeTruthy();
    expect(activeLink?.className).toContain("text-primary");
  });

  it("does NOT give inactive tab labels text-primary", () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    const { container } = render(<TripNav tripId="t1" />);
    const inactiveLinks = container.querySelectorAll(
      'a:not([aria-current="page"])',
    );
    // There should be some inactive links
    expect(inactiveLinks.length).toBeGreaterThan(0);
    inactiveLinks.forEach((link) => {
      expect(link.className).not.toContain("text-primary");
    });
  });

  it("renders the coral underline span for the active tab", () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    const { container } = render(<TripNav tripId="t1" />);
    const activeLink = container.querySelector('[aria-current="page"]');
    const underline = activeLink?.querySelector('[aria-hidden="true"]');
    expect(underline).toBeTruthy();
    expect(underline?.className).toContain("bg-primary");
  });

  it("carries ?plan= on plan-scoped surfaces only", () => {
    const hrefs = Object.fromEntries(
      [...primaryNav("t1", "fork-9"), ...moreNav("t1", "fork-9")].map((i) => [i.label, i.href]),
    );
    expect(hrefs["Plan"]).toBe("/trips/t1/plan?plan=fork-9");
    expect(hrefs["Budget"]).toBe("/trips/t1/budget?plan=fork-9");
    expect(hrefs["Wishlist"]).toBe("/trips/t1/wishlist?plan=fork-9");
    expect(hrefs["Calendar"]).toBe("/trips/t1/calendar");
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
});
