import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips");
vi.mock("next/navigation", () => ({ usePathname: () => mockUsePathname(), useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@/components/ui/theme-toggle", () => ({ ThemeToggle: () => <button>ThemeToggle</button> }));
vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => <button {...props}>{children}</button>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip Radix-only props before they reach the DOM
  DropdownMenuItem: ({ children, asChild: _a, onSelect: _o, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode; asChild?: boolean; onSelect?: unknown }) => <div {...props}>{children}</div>,
}));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { AppRail, AppRailDock, OutsideTrip, TripBoundaryRailShell } from "./app-rail";
import { ShellUserProvider } from "@/components/shell/shell-user";

// The sidebar's inline search imports the Search server actions, whose module
// opens the database at import time — stub them (no Postgres in unit tests).
vi.mock("@/server/actions/search", () => ({
  searchTrip: vi.fn(async () => []),
  listMyTrips: vi.fn(async () => []),
}));

const SHELL = {
  user: { id: "u1", name: "Alice", image: null, email: "a@example.com" },
  isAdmin: false,
  pendingAccessRequests: 0,
  trips: [],
};

beforeEach(() => mockUsePathname.mockReturnValue("/trips"));

describe("AppRail", () => {
  it("renders the Teepee rail with Trips, Globe and You", () => {
    render(<AppRail />);
    const rail = screen.getByRole("navigation", { name: "Teepee" });
    const links = within(rail).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["", "/trips"],
      ["Trips", "/trips"],
      ["Globe", "/globe"],
      ["You", "/account"],
    ]);
  });

  it.each([
    ["/trips", "Trips"],
    ["/trips/new", "Trips"],
    ["/globe", "Globe"],
    ["/globe/g1", "Globe"],
    ["/account", "You"],
  ])("lights the right item on %s", (path, label) => {
    mockUsePathname.mockReturnValue(path);
    render(<AppRail />);
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual([label]);
  });

  it("lights nothing on a page the rail has no item for", () => {
    mockUsePathname.mockReturnValue("/help");
    render(<AppRail />);
    expect(document.querySelector('[aria-current="page"]')).toBeNull();
  });

  // Inside a Trip, TripNav renders its own rail — never two.
  it.each(["/trips/t1", "/trips/t1/plan", "/trips/t1/more"])("renders nothing inside a Trip (%s)", (path) => {
    mockUsePathname.mockReturnValue(path);
    const { container } = render(<AppRail />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(["/trips/t1", "/trips", "/help"])("AppRailDock renders Trips, Globe and You regardless of pathname (%s)", (path) => {
    mockUsePathname.mockReturnValue(path);
    render(<AppRailDock />);
    const rail = screen.getByRole("navigation", { name: "Teepee" });
    expect(within(rail).getAllByRole("link").map((a) => a.textContent)).toEqual(["", "Trips", "Globe", "You"]);
  });
});

// A boundary above the trip layout (the app 404, the trips error screen)
// renders when the trip layout itself failed, so neither TripNav nor AppRail
// is there: the shell supplies the rail on a trip path, and only there.
describe("AppRail at Dock widths (Task 11)", () => {
  it("pins to the viewport top at full height and hides at xl", () => {
    render(<AppRail />);
    const rail = screen.getByRole("navigation", { name: "Teepee" });
    expect(rail.className.split(/\s+/)).toEqual(expect.arrayContaining(["md:sticky", "md:top-0", "md:h-dvh", "xl:hidden"]));
    expect(rail.className).not.toContain("3.5rem");
  });

  // Controller ruling R1.
  it("carries a search button and the Traveller's avatar menu", () => {
    render(<ShellUserProvider value={SHELL}><AppRail /></ShellUserProvider>);
    const rail = screen.getByRole("navigation", { name: "Teepee" });
    expect(within(rail).getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: "Open traveller menu" })).toBeInTheDocument();
    expect(within(rail).getByText("Sign out")).toBeInTheDocument();
  });
});

describe("OutsideTrip", () => {
  it.each(["/trips", "/trips/new", "/globe", "/account"])("renders its children on %s", (path) => {
    mockUsePathname.mockReturnValue(path);
    render(<OutsideTrip><p>Here</p></OutsideTrip>);
    expect(screen.getByText("Here")).toBeInTheDocument();
  });

  it.each(["/trips/t1", "/trips/t1/plan"])("renders nothing inside a Trip (%s)", (path) => {
    mockUsePathname.mockReturnValue(path);
    const { container } = render(<OutsideTrip><p>Here</p></OutsideTrip>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TripBoundaryRailShell", () => {
  it("adds the ≥1280px sidebar too, from the signed-in Traveller in context", () => {
    mockUsePathname.mockReturnValue("/trips/nope");
    render(<ShellUserProvider value={SHELL}><TripBoundaryRailShell><p>Gone</p></TripBoundaryRailShell></ShellUserProvider>);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose a trip" })).toBeInTheDocument();
  });

  it("adds the rail beside the content on a trip path whose layout failed", () => {
    mockUsePathname.mockReturnValue("/trips/nope");
    const { container } = render(<TripBoundaryRailShell><p>Gone</p></TripBoundaryRailShell>);
    expect(screen.getByRole("navigation", { name: "Teepee" })).toBeInTheDocument();
    expect(screen.getByText("Gone")).toBeInTheDocument();
    expect(container.querySelector("[data-rail-shell]")).not.toBeNull();
  });

  it.each(["/trips", "/globe/g1", "/account/x"])("adds nothing where AppRail already renders (%s)", (path) => {
    mockUsePathname.mockReturnValue(path);
    const { container } = render(<TripBoundaryRailShell><p>Gone</p></TripBoundaryRailShell>);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(container.innerHTML).toBe("<p>Gone</p>");
  });
});
