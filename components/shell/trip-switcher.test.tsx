import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
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
import { EMPTY_ADMIN_QUEUE } from "@/lib/admin-queue";

const CURRENT = { id: "t1", name: "Europe 2026", statusLine: "68 sleeps to go", slug: "europe-2026" };
const OTHER = { id: "t2", name: "Japan Spring", statusLine: "Day 5 of 12", slug: "japan-spring" };
const TRIPS = [CURRENT, OTHER];

describe("TripSwitcher", () => {
  it("renders the current trip's name and status line in the trigger", () => {
    render(<TripSwitcher current={CURRENT} trips={TRIPS} />);
    const trigger = screen.getByRole("button", { name: /switch trip/i });
    expect(within(trigger).getByText("Europe 2026")).toBeInTheDocument();
    expect(within(trigger).getByText("68 sleeps to go")).toBeInTheDocument();
  });

  // Ruling (spec §A): the menu lists ALL the user's trips, current included
  // — not just the others — with the current one marked.
  it("lists ALL trips (name + status line), current included", () => {
    render(<TripSwitcher current={CURRENT} trips={TRIPS} />);
    const menu = screen.getByTestId("switcher-menu");
    expect(within(menu).getByText("Japan Spring")).toBeInTheDocument();
    expect(within(menu).getByText("Day 5 of 12")).toBeInTheDocument();
    expect(within(menu).getByText("Europe 2026")).toBeInTheDocument();
    expect(within(menu).getByText("68 sleeps to go")).toBeInTheDocument();
  });

  it("marks the current trip's row aria-current=page, and no other row", () => {
    render(<TripSwitcher current={CURRENT} trips={TRIPS} />);
    const menu = screen.getByTestId("switcher-menu");
    const links = within(menu).getAllByRole("link");
    const current = links.find((a) => a.getAttribute("aria-current") === "page");
    expect(current?.textContent).toContain("Europe 2026");
    expect(links.filter((a) => a.getAttribute("aria-current") === "page")).toHaveLength(1);
  });

  it("links each trip (current included) to its slug (ADR 0064)", () => {
    render(<TripSwitcher current={CURRENT} trips={TRIPS} />);
    const menu = screen.getByTestId("switcher-menu");
    expect(within(menu).getByRole("link", { name: /japan spring/i }).getAttribute("href")).toBe("/trips/japan-spring");
    expect(within(menu).getByRole("link", { name: /europe 2026/i }).getAttribute("href")).toBe("/trips/europe-2026");
  });

  it('has "All trips" → /trips and "+ New trip" → /trips/new', () => {
    render(<TripSwitcher current={CURRENT} trips={TRIPS} />);
    const menu = screen.getByTestId("switcher-menu");
    expect(within(menu).getByRole("link", { name: "All trips" }).getAttribute("href")).toBe("/trips");
    expect(within(menu).getByRole("link", { name: "+ New trip" }).getAttribute("href")).toBe("/trips/new");
  });

  it("still lists the current trip (marked) plus All trips / + New trip when it's the only trip", () => {
    render(<TripSwitcher current={CURRENT} trips={[CURRENT]} />);
    const menu = screen.getByTestId("switcher-menu");
    expect(within(menu).getByRole("link", { name: /europe 2026/i })).toHaveAttribute("aria-current", "page");
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
      <ShellUserProvider value={{ user: { id: "u1", name: "Alice", image: null, email: null }, isAdmin: false, adminQueue: EMPTY_ADMIN_QUEUE, trips: TRIPS, lastTrip: null }}>
        <TripSwitcherFromContext tripId="t2" fallbackName="fallback" />
      </ShellUserProvider>,
    );
    const trigger = screen.getByRole("button", { name: /switch trip/i });
    expect(within(trigger).getByText("Japan Spring")).toBeInTheDocument();
  });

  it("falls back to fallbackName when the trip isn't (yet) in the context's list", () => {
    render(
      <ShellUserProvider value={{ user: { id: "u1", name: "Alice", image: null, email: null }, isAdmin: false, adminQueue: EMPTY_ADMIN_QUEUE, trips: [], lastTrip: null }}>
        <TripSwitcherFromContext tripId="t9" fallbackName="Brand New Trip" />
      </ShellUserProvider>,
    );
    const trigger = screen.getByRole("button", { name: /switch trip/i });
    expect(within(trigger).getByText("Brand New Trip")).toBeInTheDocument();
  });

  it("still marks that fallback trip current in the menu, even though it isn't in the context's list", () => {
    render(
      <ShellUserProvider value={{ user: { id: "u1", name: "Alice", image: null, email: null }, isAdmin: false, adminQueue: EMPTY_ADMIN_QUEUE, trips: [OTHER], lastTrip: null }}>
        <TripSwitcherFromContext tripId="t9" fallbackName="Brand New Trip" />
      </ShellUserProvider>,
    );
    const menu = screen.getByTestId("switcher-menu");
    expect(within(menu).getByRole("link", { name: /brand new trip/i })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: /japan spring/i })).not.toHaveAttribute("aria-current");
  });
});
