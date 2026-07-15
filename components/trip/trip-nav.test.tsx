import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { TripNav } from "./trip-nav";

// Use a vi.fn() so individual tests can override the return value per-test.
const mockUsePathname = vi.fn(() => "/trips/t1");

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
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
});
