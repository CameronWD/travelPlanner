import type { Route } from "next";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips");
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSelectedLayoutSegment: () => null,
}));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => <button {...props}>{children}</button>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip Radix-only props before they reach the DOM
  DropdownMenuItem: ({ children, asChild: _a, onSelect: _o, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode; asChild?: boolean; onSelect?: unknown }) => <div {...props}>{children}</div>,
}));
vi.mock("@/components/shell/search-field", () => ({ SearchField: () => null }));
vi.mock("@/components/shell/dock-extras", () => ({ DockSearchButton: () => null, DockAccountMenu: () => null }));

import { AppShellRail } from "./app-shell-rail";
import { RailTripProvider, RailTripPublisher } from "./rail-trip";
import { ShellUserProvider, type ShellUser } from "./shell-user";
import { TripBoundaryRailShell } from "@/components/app-rail";
import { EMPTY_ADMIN_QUEUE } from "@/lib/admin-queue";

const CHRISTMAS = { id: "t1", slug: "christmas", name: "Christmas", statusLine: "68 sleeps" };
const SHELL: ShellUser = {
  user: { id: "u1", name: "Alice", image: null, email: "a@example.com" },
  isAdmin: false,
  adminQueue: EMPTY_ADMIN_QUEUE,
  trips: [CHRISTMAS],
  lastTrip: CHRISTMAS,
};

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <ShellUserProvider value={SHELL}>
      <RailTripProvider>
        <AppShellRail />
        {children}
      </RailTripProvider>
    </ShellUserProvider>
  );
}

const sidebar = () => screen.getByTestId("sidebar");
const sidebarNav = () => within(sidebar()).getByRole("navigation", { name: "Main" });

beforeEach(() => mockUsePathname.mockReturnValue("/trips"));

describe("AppShellRail (Feedback cmumclo5t000004jyyll3imed)", () => {
  it("on /trips shows the Trips/Globe/You Dock and a sidebar with no trip rows and the Back-to card", () => {
    render(<Shell />);
    const dock = screen.getByRole("navigation", { name: "Teepee" });
    expect(within(dock).getAllByRole("link").map((a) => a.textContent)).toEqual(["", "Trips", "Globe", "You"]);
    expect(within(sidebarNav()).getByRole("link", { name: /^Trips/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Plan" })).toBeNull();
    expect(within(sidebar()).getByText("Back to")).toBeInTheDocument();
  });

  it("on a trip path renders the trip rows from the URL ref before anything is published, with a skeleton switcher", () => {
    mockUsePathname.mockReturnValue("/trips/christmas/plan");
    render(<Shell />);
    expect(within(sidebarNav()).getByRole("link", { name: "Plan" })).toHaveAttribute("href", "/trips/christmas/plan");
    const dock = screen.getByRole("navigation", { name: "Trip sections" });
    expect(within(dock).getByRole("link", { name: "Plan" })).toHaveAttribute("href", "/trips/christmas/plan");
    expect(within(dock).getByRole("link", { name: "Trips" })).toHaveAttribute("href", "/trips");
    expect(screen.getByTestId("sidebar-trip-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Back to")).toBeNull();
  });

  it("swaps the skeleton for the switcher once the trip layout publishes, without remounting the rail", () => {
    mockUsePathname.mockReturnValue("/trips/christmas");
    const { rerender } = render(<Shell />);
    const aside = sidebar();
    const dock = screen.getByRole("navigation", { name: "Trip sections" });
    expect(screen.getByTestId("sidebar-trip-skeleton")).toBeInTheDocument();

    rerender(
      <Shell>
        <RailTripPublisher
          id="t1"
          slug="christmas"
          name="Christmas"
          daysHref={"/trips/christmas/day/2026-12-04" as Route}
          counts={{ Plan: <span>3</span> }}
          switcher={<div>SWITCHER</div>}
        />
      </Shell>,
    );
    expect(screen.getByText("SWITCHER")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-trip-skeleton")).toBeNull();
    expect(within(sidebarNav()).getByRole("link", { name: "Days" })).toHaveAttribute("href", "/trips/christmas/day/2026-12-04");
    expect(within(sidebarNav()).getByRole("link", { name: /Plan/ })).toHaveTextContent("3");
    expect(sidebar()).toBe(aside); // same DOM node
    expect(screen.getByRole("navigation", { name: "Trip sections" })).toBe(dock);
  });

  it("keeps the same rail DOM across the trip boundary (trip → /trips)", () => {
    mockUsePathname.mockReturnValue("/trips/christmas");
    const { rerender } = render(<Shell />);
    const aside = sidebar();
    const dock = screen.getByRole("navigation", { name: "Trip sections" });
    mockUsePathname.mockReturnValue("/trips");
    rerender(<Shell />);
    expect(sidebar()).toBe(aside);
    expect(screen.getByRole("navigation", { name: "Teepee" })).toBe(dock);
  });

  it("ignores a stale publication for a different trip (URL says another slug)", () => {
    mockUsePathname.mockReturnValue("/trips/christmas");
    render(
      <Shell>
        <RailTripPublisher id="t9" slug="japan" name="Japan" daysHref={"/trips/japan/day/2027-04-01" as Route} switcher={<div>JAPAN</div>} />
      </Shell>,
    );
    expect(screen.queryByText("JAPAN")).toBeNull();
    expect(screen.getByTestId("sidebar-trip-skeleton")).toBeInTheDocument();
    expect(within(sidebarNav()).getByRole("link", { name: "Days" })).toHaveAttribute("href", "/trips/christmas/day");
  });

  it("matches a publication by id when the URL carries the id", () => {
    mockUsePathname.mockReturnValue("/trips/t1/plan");
    render(
      <Shell>
        <RailTripPublisher id="t1" slug="christmas" name="Christmas" daysHref={null} switcher={<div>SWITCHER</div>} />
      </Shell>,
    );
    expect(screen.getByText("SWITCHER")).toBeInTheDocument();
    expect(within(sidebarNav()).getByRole("link", { name: "Plan" })).toHaveAttribute("href", "/trips/christmas/plan");
  });

  // Plan Review Focus #1: a Trip that 404s or errors (boundaries above the
  // trip layout) must not leave URL-built rows and a skeleton forever.
  it("on a trip path whose layout failed, the boundary makes the rail show the trips-level Dock and the Back-to card", () => {
    mockUsePathname.mockReturnValue("/trips/nope");
    render(<Shell><TripBoundaryRailShell><p>Gone</p></TripBoundaryRailShell></Shell>);
    expect(screen.getByText("Gone")).toBeInTheDocument();
    const dock = screen.getByRole("navigation", { name: "Teepee" });
    expect(within(dock).getAllByRole("link").map((a) => a.textContent)).toEqual(["", "Trips", "Globe", "You"]);
    expect(screen.queryByRole("navigation", { name: "Trip sections" })).toBeNull();
    expect(within(sidebar()).getByText("Back to")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-trip-skeleton")).toBeNull();
    expect(screen.queryByRole("link", { name: "Plan" })).toBeNull();
  });

  it("on a failed Trip with no last trip, the switcher reads Choose a trip", () => {
    mockUsePathname.mockReturnValue("/trips/nope/plan");
    render(
      <ShellUserProvider value={{ ...SHELL, lastTrip: null }}>
        <RailTripProvider>
          <AppShellRail />
          <TripBoundaryRailShell><p>Gone</p></TripBoundaryRailShell>
        </RailTripProvider>
      </ShellUserProvider>,
    );
    expect(screen.getByRole("link", { name: "Choose a trip" })).toHaveAttribute("href", "/trips");
    expect(screen.queryByTestId("sidebar-trip-skeleton")).toBeNull();
  });

  it("leaves the failed state behind once the boundary unmounts (navigating on to a real Trip), keeping the rail DOM", () => {
    mockUsePathname.mockReturnValue("/trips/nope");
    const { rerender } = render(<Shell><TripBoundaryRailShell><p>Gone</p></TripBoundaryRailShell></Shell>);
    const aside = sidebar();
    const dock = screen.getByRole("navigation", { name: "Teepee" });
    rerender(<Shell />);
    expect(screen.getByRole("navigation", { name: "Trip sections" })).toBe(dock);
    expect(screen.getByTestId("sidebar-trip-skeleton")).toBeInTheDocument();
    expect(sidebar()).toBe(aside);
  });

  it("clears the publication when the trip layout unmounts", () => {
    mockUsePathname.mockReturnValue("/trips/christmas");
    const publisher = <RailTripPublisher id="t1" slug="christmas" name="Christmas" daysHref={null} switcher={<div>SWITCHER</div>} />;
    const { rerender } = render(<Shell>{publisher}</Shell>);
    expect(screen.getByText("SWITCHER")).toBeInTheDocument();
    rerender(<Shell />);
    expect(screen.queryByText("SWITCHER")).toBeNull();
    expect(screen.getByTestId("sidebar-trip-skeleton")).toBeInTheDocument();
  });

  it("renders nothing without a signed-in Traveller", () => {
    const { container } = render(<RailTripProvider><AppShellRail /></RailTripProvider>);
    expect(container).toBeEmptyDOMElement();
  });
});
