import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
// Radix only renders menu content when open; stub so the menu is always inspectable.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => <button {...props}>{children}</button>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div data-testid="switcher-menu">{children}</div>,
  DropdownMenuItem: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => <div {...props}>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

import { TripSwitcher, TripSwitcherFromContext } from "./trip-switcher";
import { ShellUserProvider } from "./shell-user";

const CURRENT = { id: "t1", name: "Europe 2026", statusLine: "68 sleeps to go" };
const OTHER = { id: "t2", name: "Japan Spring", statusLine: "Day 5 of 12" };
const TRIPS = [CURRENT, OTHER];

describe("TripSwitcher", () => {
  it("renders the current trip's name and status line in the trigger", () => {
    render(<TripSwitcher current={CURRENT} trips={TRIPS} />);
    const trigger = screen.getByRole("button", { name: /switch trip/i });
    expect(within(trigger).getByText("Europe 2026")).toBeInTheDocument();
    expect(within(trigger).getByText("68 sleeps to go")).toBeInTheDocument();
  });

  it("lists the other trips (name + status line) but not the current one", () => {
    render(<TripSwitcher current={CURRENT} trips={TRIPS} />);
    const menu = screen.getByTestId("switcher-menu");
    expect(within(menu).getByText("Japan Spring")).toBeInTheDocument();
    expect(within(menu).getByText("Day 5 of 12")).toBeInTheDocument();
    expect(within(menu).queryByText("68 sleeps to go")).toBeNull();
  });

  it("links each other trip to /trips/:id", () => {
    render(<TripSwitcher current={CURRENT} trips={TRIPS} />);
    const menu = screen.getByTestId("switcher-menu");
    expect(within(menu).getByRole("link", { name: /japan spring/i }).getAttribute("href")).toBe("/trips/t2");
  });

  it('has "All trips" → /trips and "+ New trip" → /trips/new', () => {
    render(<TripSwitcher current={CURRENT} trips={TRIPS} />);
    const menu = screen.getByTestId("switcher-menu");
    expect(within(menu).getByRole("link", { name: "All trips" }).getAttribute("href")).toBe("/trips");
    expect(within(menu).getByRole("link", { name: "+ New trip" }).getAttribute("href")).toBe("/trips/new");
  });

  it("still offers All trips / + New trip with no other trips", () => {
    render(<TripSwitcher current={CURRENT} trips={[CURRENT]} />);
    const menu = screen.getByTestId("switcher-menu");
    expect(within(menu).getByRole("link", { name: "All trips" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "+ New trip" })).toBeInTheDocument();
  });

  it("the pill variant shows the trip name but not the stacked status line in the trigger", () => {
    render(<TripSwitcher current={CURRENT} trips={TRIPS} variant="pill" />);
    const trigger = screen.getByRole("button", { name: /switch trip/i });
    expect(within(trigger).getByText("Europe 2026")).toBeInTheDocument();
    expect(within(trigger).queryByText("68 sleeps to go")).toBeNull();
  });
});

describe("TripSwitcherFromContext", () => {
  it("renders nothing outside ShellUserProvider", () => {
    const { container } = render(<TripSwitcherFromContext tripId="t1" fallbackName="Europe 2026" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("finds the current trip in the context's trips list", () => {
    render(
      <ShellUserProvider value={{ user: { id: "u1", name: "Alice", image: null, email: null }, isAdmin: false, pendingAccessRequests: 0, trips: TRIPS }}>
        <TripSwitcherFromContext tripId="t2" fallbackName="fallback" />
      </ShellUserProvider>,
    );
    const trigger = screen.getByRole("button", { name: /switch trip/i });
    expect(within(trigger).getByText("Japan Spring")).toBeInTheDocument();
  });

  it("falls back to fallbackName when the trip isn't (yet) in the context's list", () => {
    render(
      <ShellUserProvider value={{ user: { id: "u1", name: "Alice", image: null, email: null }, isAdmin: false, pendingAccessRequests: 0, trips: [] }}>
        <TripSwitcherFromContext tripId="t9" fallbackName="Brand New Trip" />
      </ShellUserProvider>,
    );
    const trigger = screen.getByRole("button", { name: /switch trip/i });
    expect(within(trigger).getByText("Brand New Trip")).toBeInTheDocument();
  });
});
