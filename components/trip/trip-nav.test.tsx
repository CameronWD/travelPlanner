import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TripNav, primaryNav, moreNav, isNavActive, isDaysActive, tripRailItems } from "./trip-nav";
import { ShellUserProvider } from "@/components/shell/shell-user";
import { DaysHrefProvider } from "@/components/trip/days-href-context";

// Use a vi.fn() so individual tests can override the return value per-test.
const mockUsePathname = vi.fn(() => "/trips/t1");
const mockUseSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => <button {...props}>{children}</button>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div data-testid="account-menu">{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip Radix-only props before they reach the DOM
  DropdownMenuItem: ({ children, asChild: _a, onSelect: _o, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode; asChild?: boolean; onSelect?: unknown }) => <div {...props}>{children}</div>,
}));

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
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
  it("keeps a fork's ?plan= alive across navigation, in the Plan and Money hrefs but not Days or Calendar", () => {
    mockUsePathname.mockReturnValue("/trips/t1/plan");
    mockUseSearchParams.mockReturnValue(new URLSearchParams("plan=abc"));
    const { getByText } = render(<TripNav tripId="t1" />);
    expect(getByText("Plan").getAttribute("href")).toBe("/trips/t1/plan?plan=abc");
    expect(getByText("Money").getAttribute("href")).toBe("/trips/t1/budget?plan=abc");
    expect(getByText("Days").getAttribute("href")).toBe("/trips/t1/day");
    expect(getByText("Calendar").getAttribute("href")).toBe("/trips/t1/calendar");
  });

  it("carries ?plan= on plan-scoped surfaces only", () => {
    const hrefs = Object.fromEntries(
      [...primaryNav("t1", "fork-9"), ...moreNav("t1", "fork-9")].map((i) => [i.label, i.href]),
    );
    expect(hrefs["Plan"]).toBe("/trips/t1/plan?plan=fork-9");
    expect(hrefs["Money"]).toBe("/trips/t1/budget?plan=fork-9");
    expect(hrefs["Wishlist"]).toBe("/trips/t1/wishlist?plan=fork-9");
    expect(hrefs["Days"]).toBe("/trips/t1/day");
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

  it("isDaysActive matches /day and /day/… but not Calendar or a sibling route that merely starts with 'day'", () => {
    expect(isDaysActive("/trips/t1/day", "/trips/t1/day/2026-12-04", "/trips/t1")).toBe(true);
    expect(isDaysActive("/trips/t1/day", "/trips/t1/day", "/trips/t1")).toBe(true);
    expect(isDaysActive("/trips/t1/day", "/trips/t1/calendar", "/trips/t1")).toBe(false);
    expect(isDaysActive("/trips/t1/day", "/trips/t1/daybook", "/trips/t1")).toBe(false);
    expect(isDaysActive("/trips/t1/day", "/trips/t1/plan", "/trips/t1")).toBe(false);
  });

  // Beta feedback G2: More is a page of sections, so the rail's More is a
  // plain link — lit on any section it holds, and on /more itself.
  it("links More to the trip's More page", () => {
    render(<TripNav tripId="t1" />);
    expect(screen.getByRole("link", { name: "More" })).toHaveAttribute("href", "/trips/t1/more");
  });

  it.each(["/trips/t1/more", "/trips/t1/journal", "/trips/t1/summary", "/trips/t1/help"])(
    "lights More on %s",
    (path) => {
      mockUsePathname.mockReturnValue(path);
      render(<TripNav tripId="t1" />);
      expect(screen.getByRole("link", { name: "More" })).toHaveAttribute("aria-current", "page");
    },
  );

  it("does not light More on Plan", () => {
    mockUsePathname.mockReturnValue("/trips/t1/plan");
    render(<TripNav tripId="t1" />);
    expect(screen.getByRole("link", { name: "More" })).not.toHaveAttribute("aria-current");
  });

  // Task 11: no top bar from md up, and the sidebar takes over at xl.
  it("pins to the viewport top at full height and hides at xl", () => {
    render(<TripNav tripId="t1" />);
    const rail = screen.getByRole("navigation", { name: "Trip sections" });
    const classes = rail.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["md:sticky", "md:top-0", "md:h-dvh", "xl:hidden"]));
    expect(rail.className).not.toContain("3.5rem");
  });

  // Controller ruling R1.
  it("puts a search button under the mark that opens the full-screen palette", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    render(<TripNav tripId="t1" />);
    const rail = screen.getByRole("navigation", { name: "Trip sections" });
    const search = within(rail).getByRole("button", { name: "Search" });
    // Directly after the mark link.
    expect(search.previousElementSibling?.getAttribute("aria-label")).toBe("Teepee home");
    search.click();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: "teepee:open-palette" }));
    spy.mockRestore();
  });

  it("pins the signed-in Traveller's avatar menu to the bottom, keeping the trip items", () => {
    render(
      <ShellUserProvider
        value={{
          user: { id: "u1", name: "Alice", image: null, email: "a@example.com" },
          isAdmin: true,
          pendingAccessRequests: 2,
          trips: [],
        }}
      >
        <TripNav tripId="t1" />
      </ShellUserProvider>,
    );
    const rail = screen.getByRole("navigation", { name: "Trip sections" });
    expect(within(rail).getByRole("button", { name: "Open traveller menu" })).toBeInTheDocument();
    const menu = within(rail).getByTestId("account-menu");
    for (const [name, href] of [[/^account$/i, "/account"], [/how to use teepee/i, "/help"], [/what's new/i, "/whats-new"], [/^admin/i, "/admin"]] as const) {
      expect(within(menu).getByRole("link", { name }).getAttribute("href")).toBe(href);
    }
    expect(within(menu).getByLabelText("2 pending access requests")).toBeInTheDocument();
    expect(within(menu).getByText("Switch to dark theme")).toBeInTheDocument();
    expect(within(menu).getByText("Sign out")).toBeInTheDocument();
    expect(within(rail).getByRole("link", { name: "Wishlist" })).toBeInTheDocument();
  });

  it("renders no avatar menu without a signed-in Traveller in context", () => {
    render(<TripNav tripId="t1" />);
    expect(screen.queryByRole("button", { name: "Open traveller menu" })).toBeNull();
  });

  it("TripNav reads the Days target from DaysHrefProvider", () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    render(<DaysHrefProvider href="/trips/t1/day/2026-12-04"><TripNav tripId="t1" /></DaysHrefProvider>);
    expect(screen.getByRole("link", { name: "Days" })).toHaveAttribute("href", "/trips/t1/day/2026-12-04");
  });
});

describe("tripRailItems", () => {
  it("is Home, Plan, Days, Calendar, Money, Wishlist, More — no Today", () => {
    expect(tripRailItems("t1").map((i) => i.label)).toEqual([
      "Home", "Plan", "Days", "Calendar", "Money", "Wishlist", "More",
    ]);
  });

  it("threads ?plan= through Plan, Money and Wishlist only", () => {
    const hrefs = Object.fromEntries(tripRailItems("t1", "f1").map((i) => [i.label, i.href]));
    expect(hrefs).toEqual({
      Home: "/trips/t1",
      Plan: "/trips/t1/plan?plan=f1",
      Days: "/trips/t1/day",
      Calendar: "/trips/t1/calendar",
      Money: "/trips/t1/budget?plan=f1",
      Wishlist: "/trips/t1/wishlist?plan=f1",
      More: "/trips/t1/more",
    });
  });

  it("tripRailItems points Days at the default day when given one, and still lights Days on any other date (ADR 0063)", () => {
    const items = tripRailItems("t1", null, "/trips/t1/day/2026-12-04");
    const days = items.find((i) => i.label === "Days")!;
    expect(days.href).toBe("/trips/t1/day/2026-12-04");
    expect(days.match("/trips/t1/day/2026-12-09")).toBe(true);
    expect(days.match("/trips/t1/calendar")).toBe(false);
    expect(tripRailItems("t1", null, null).find((i) => i.label === "Days")!.href).toBe("/trips/t1/day");
  });
});
