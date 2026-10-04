import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips");
vi.mock("next/navigation", () => ({ usePathname: () => mockUsePathname(), useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
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
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { OnTripPath, OutsideTrip, TripBoundaryRailShell } from "./app-rail";
import { ShellUserProvider } from "@/components/shell/shell-user";
import { EMPTY_ADMIN_QUEUE } from "@/lib/admin-queue";

// The sidebar's inline search imports the Search server actions, whose module
// opens the database at import time — stub them (no Postgres in unit tests).
vi.mock("@/server/actions/search", () => ({
  searchTrip: vi.fn(async () => []),
  listMyTrips: vi.fn(async () => []),
}));

const SHELL = {
  user: { id: "u1", name: "Alice", image: null, email: "a@example.com" },
  isAdmin: false,
  adminQueue: EMPTY_ADMIN_QUEUE,
  trips: [],
  lastTrip: null,
};

beforeEach(() => mockUsePathname.mockReturnValue("/trips"));

// AppRail / AppRailDock are gone: the one rail is AppShellRail, mounted once
// by the app layout (components/shell/app-shell-rail.test.tsx covers it).

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

describe("OnTripPath", () => {
  it.each(["/trips/t1", "/trips/t1/plan"])("renders its children inside a Trip (%s)", (path) => {
    mockUsePathname.mockReturnValue(path);
    render(<OnTripPath><p>Here</p></OnTripPath>);
    expect(screen.getByText("Here")).toBeInTheDocument();
  });

  it.each(["/trips", "/trips/new", "/globe"])("renders nothing outside a Trip (%s)", (path) => {
    mockUsePathname.mockReturnValue(path);
    const { container } = render(<OnTripPath><p>Here</p></OnTripPath>);
    expect(container).toBeEmptyDOMElement();
  });
});

// The rail now lives in the app layout (AppShellRail) and is on screen above
// any boundary, so the boundary shell adds nothing — never a second rail.
describe("TripBoundaryRailShell", () => {
  it.each(["/trips/nope", "/trips/nope/plan", "/trips", "/globe/g1", "/account/x"])("renders its children and adds no rail (%s)", (path) => {
    mockUsePathname.mockReturnValue(path);
    const shellWithTrip = { ...SHELL, trips: [{ id: "t1", name: "Europe 2026", statusLine: "", slug: "t1" }] };
    const { container } = render(<ShellUserProvider value={shellWithTrip}><TripBoundaryRailShell><p>Gone</p></TripBoundaryRailShell></ShellUserProvider>);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByTestId("sidebar")).toBeNull();
    expect(container.innerHTML).toBe("<p>Gone</p>");
  });
});
