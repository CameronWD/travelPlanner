import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

// ── Module mocks (must be declared before any imports of the mocked modules) ──

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// layout.tsx pulls in @/lib/invites and @/lib/globe-invites, which both import
// @/lib/db at module scope. lib/db.ts now throws at import time when
// DATABASE_URL is unset (which it is under vitest) — mock it so this render
// test doesn't need a real database, same as every other test in the suite.
//
// `accessRequest.findMany` is the one query listAccessRequests (called from
// layout.tsx for the Admin nav badge) can reach — real for a non-admin
// session (isAdminEmail short-circuits first, so it's never called at all),
// but reachable when a test signs in as an ADMIN_EMAILS operator.
const accessRequestFindManyMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
// The trip switcher (Task 12) loads the Traveller's trips here; empty by
// default so the existing assertions (which don't care about the switcher)
// don't need their own membership fixtures.
const tripMemberFindManyMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
// The shell now reads the signed-in Traveller from the DB (Task 2) instead
// of session.user's name/image, so a Display name or Profile photo change
// shows immediately rather than waiting on the next sign-in.
const userFindUniqueMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: "user-1",
    name: "Alice Test",
    email: "alice@example.com",
    image: null,
    displayName: null,
    photoKey: null,
    photoUpdatedAt: null,
  }),
);
vi.mock("@/lib/db", () => ({
  db: {
    accessRequest: { findMany: accessRequestFindManyMock },
    user: { findUnique: userFindUniqueMock },
    tripMember: { findMany: tripMemberFindManyMock },
  },
}));

// The shell now mounts the Feedback launcher, a client component that reads the
// current route — so this mock has to cover usePathname as well as redirect.
// The sidebar's nav reads ?plan= as well.
//
// usePathname is hoisted and overridable per test (Task 12): outside a Trip
// the phone top bar is gone (OnTripPath) and the AppTabBar takes its place,
// so tests about the header's content now render on a trip path, while
// tests about the non-trip chrome (AppShellRail, AppTabBar) keep the
// default "/trips".
const mockUsePathname = vi.hoisted(() => vi.fn(() => "/trips"));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  usePathname: mockUsePathname,
  useSearchParams: vi.fn(() => new URLSearchParams()),
  // SectionTransition (ADR 0063) reads this from the layout.
  useSelectedLayoutSegment: vi.fn(() => null),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

// The sidebar's "Back to" card (Task 11) reads the last-trip cookie
// server-side; no cookie by default so existing assertions (which don't care
// about it) get the SidebarTripPlaceholder fallback as before.
const cookiesGetMock = vi.hoisted(() => vi.fn().mockReturnValue(undefined));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookiesGetMock }),
}));

// next/link renders a plain <a> in jsdom
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Stub Radix DropdownMenu so DropdownMenuContent always renders its children
// (the real component only renders content when the menu is open).
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => <button {...props}>{children}</button>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip Radix-only props before they reach the DOM
  DropdownMenuItem: ({ children, asChild: _asChild, onSelect: _onSelect, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode; asChild?: boolean; onSelect?: unknown }) => <div {...props}>{children}</div>,
}));

// The Dock's account menu carries a theme row (it has no ThemeToggle beside it).
vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

// ThemeToggle is a client component; stub it to avoid
// client-only hooks in the jsdom test environment.
vi.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => <button>ThemeToggle</button>,
}));

vi.mock("@/components/command-palette-mount", () => ({ CommandPaletteMount: () => null }));
vi.mock("@/components/command-palette-trigger", () => ({ CommandPaletteTrigger: () => null }));
vi.mock("@/components/shell/search-field", () => ({ SearchField: () => null }));

// ── Imports (after mocks) ──

import { auth } from "@/lib/auth";
import AppLayout from "./layout";

// The phone header, the Dock (768–1279px) and the sidebar (≥1280px) each
// render the Traveller's avatar menu, and CSS breakpoints don't apply in
// jsdom — so header assertions are scoped to the <header> element.
const header = () => document.querySelector("header")!;

// Outside a Trip, AppShellRail's Dock and the new AppTabBar are both mounted at
// once (CSS media queries pick one; jsdom renders both), and both are named
// "Teepee" — so a plain getByRole("navigation", { name: "Teepee" }) is now
// ambiguous there. The Dock is the one with no "fixed inset-x-0 bottom-0"
// (TabBar's own signature); AppTabBar is the other one.
const teepeeNavs = () => screen.getAllByRole("navigation", { name: "Teepee" });
const dockNav = () => teepeeNavs().find((n) => !n.className.includes("fixed inset-x-0 bottom-0"))!;
const tabBarNav = () => teepeeNavs().find((n) => n.className.includes("fixed inset-x-0 bottom-0"))!;

// ── Shared test fixture ──

const SIGNED_IN_SESSION = {
  user: { id: "user-1", name: "Alice Test", email: "alice@example.com", image: null },
};

const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePathname.mockReturnValue("/trips");
  // Default: signed-in user
  vi.mocked(auth).mockResolvedValue(SIGNED_IN_SESSION as never);
  accessRequestFindManyMock.mockResolvedValue([]);
  tripMemberFindManyMock.mockResolvedValue([]);
  cookiesGetMock.mockReturnValue(undefined);
  userFindUniqueMock.mockResolvedValue({
    id: "user-1",
    name: "Alice Test",
    email: "alice@example.com",
    image: null,
    displayName: null,
    photoKey: null,
    photoUpdatedAt: null,
  });
  delete process.env.ADMIN_EMAILS;
});

afterEach(() => {
  if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
});

// ── Tests ──

describe("AppLayout", () => {
  it("redirects to / when no session", async () => {
    const { redirect } = await import("next/navigation");
    vi.mocked(auth).mockResolvedValue(null as never);
    // redirect() is mocked and doesn't throw; the component may error after the
    // redirect call because session is null. Only suppress the expected
    // TypeError from destructuring a null session; rethrow anything unexpected.
    try {
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
    }
    expect(redirect).toHaveBeenCalledWith("/");
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("renders the Teepee wordmark link when authenticated", async () => {
    // The header now only mounts inside a Trip (spec D4) — its own content is
    // still exercised here, just on a trip path.
    mockUsePathname.mockReturnValue("/trips/t1");
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    expect(
      within(header()).getByRole("link", { name: "Teepee — go to your trips" }),
    ).toBeInTheDocument();
    // Spec 2026-09-28 D3: the sticky phone top bar is its own View Transition
    // group, so the section crossfade cannot paint page content over it.
    expect(header().className.split(/\s+/)).toContain("tp-vt-top-bar");
  });

  it("renders the avatar trigger button for the user menu", async () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    // The avatar dropdown trigger button should be in the DOM
    expect(within(header()).getByRole("button", { name: /traveller menu/i })).toBeInTheDocument();
  });

  // Task 2: the shell reads the signed-in Traveller from the DB (not
  // session.user's name/image), keyed on the session's id, so a Display name
  // set on the Account card shows immediately rather than waiting for the
  // next sign-in to refresh the session's own copy.
  it("shows the DB Display name in the traveller dropdown label, not the session's provider name", async () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    userFindUniqueMock.mockResolvedValue({
      id: "user-1",
      name: "Alice Test",
      email: "alice@example.com",
      image: null,
      displayName: "Al",
      photoKey: null,
      photoUpdatedAt: null,
    });
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    expect(userFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    );
    expect(within(header()).getByText("Al")).toBeInTheDocument();
    expect(screen.queryByText("Alice Test")).not.toBeInTheDocument();
  });

  // LA-050: the header's icon-sized controls get a 44px tap target.
  it("gives the header's avatar trigger a 44px tap target", async () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    // A real 44px box, not tap-target's invisible ::before: flush against the
    // header's trailing edge, that pseudo poked 4px past a 360px viewport and
    // made every phone page scroll sideways (Stage 2 diagnosis G).
    const avatar = within(header()).getByRole("button", { name: "Open traveller menu" });
    expect(avatar.className).toContain("size-11");
    expect(avatar.className).toContain("grid");
    expect(avatar.className).toContain("place-items-center");
    expect(avatar.className).not.toContain("tap-target");
  });

  it("fits the header's right-hand controls inside a 360px phone", async () => {
    // Logo (~131px) + search, theme and avatar must fit 360 - 2 x 16px:
    // phones get the tighter gap.
    mockUsePathname.mockReturnValue("/trips/t1");
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    const avatar = within(header()).getByRole("button", { name: "Open traveller menu" });
    const cluster = avatar.parentElement as HTMLElement;
    expect(cluster.className).toContain("gap-1");
    expect(cluster.className).toContain("sm:gap-2");
  });

  // Beta feedback G1: the rail is on every page, not only inside a Trip, so
  // from md up Globe lives there. The rail is md+ only and the phone tab bar
  // has no Globe, so the header keeps a phones-only (md:hidden) Globe link.
  it("mounts the Teepee rail (Trips, Globe, You) on a non-trip page", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    const rail = dockNav();
    for (const [name, href] of [["Trips", "/trips"], ["Globe", "/globe"], ["You", "/account"]]) {
      expect(within(rail).getByRole("link", { name }).getAttribute("href")).toBe(href);
    }
  });

  it("keeps a phones-only Globe link in the header (md:hidden)", async () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    const header = document.querySelector("header")!;
    const globe = within(header).getByRole("link", { name: "Globe" });
    expect(globe.getAttribute("href")).toBe("/globe");
    expect(globe.className.split(/\s+/)).toContain("md:hidden");
  });

  it("renders the Logo lockup with a single accessible name for the link", async () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    // The Link's own aria-label ("Teepee — go to your trips") wins over
    // Logo's generic self-label ("Teepee") per the accessible-name spec, so
    // there must be exactly one accessible name for the control — not two.
    const link = within(header()).getByRole("link", { name: "Teepee — go to your trips" });
    expect(screen.queryByRole("link", { name: "Teepee" })).not.toBeInTheDocument();
    // The lockup itself is still present inside, self-labelled as "Teepee",
    // with its inner mark + wordmark SVGs kept decorative.
    const brandImg = within(link).getByRole("img", { name: "Teepee" });
    const svgs = brandImg.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((svg) => expect(svg).toHaveAttribute("aria-hidden", "true"));
  });

  it("caps non-trip content at the shared wide width and goes full-bleed for the trip shell", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    const main = screen.getByTestId("app-main");
    expect(main.className).toContain("max-w-page-wide");
    expect(main.className).toContain("has-[[data-trip-shell]]:max-w-none");
    expect(main.className).toContain("has-[[data-trip-shell]]:p-0");
    // Boundaries no longer supply a rail of their own (AppShellRail is above
    // them), so nothing renders [data-rail-shell] and <main> has no rule for it.
    expect(main.className).not.toContain("data-rail-shell");
    expect(main.className).not.toMatch(/max-w-(5xl|6xl|7xl)/);
  });

  it("lets the top bar span the full width", async () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    const header = document.querySelector("header")!;
    expect(header.innerHTML).not.toMatch(/max-w-(5xl|6xl|7xl)/);
  });

  it("mounts the feedback launcher for a signed-in traveller", async () => {
    render(await AppLayout({ children: <div /> }));
    expect(
      screen.getByRole("button", { name: /leave feedback/i }),
    ).toBeInTheDocument();
  });

  it("offers a Help link in the traveller dropdown", async () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    // Link text matches the established "How to use TEEPEE" title used on the
    // /help pages themselves (see app/(app)/help/page.tsx), not the word "Help".
    const link = within(header()).getByRole("link", { name: /how to use teepee/i });
    expect(link.getAttribute("href")).toBe("/help");
  });

  it("offers an Account link in the traveller dropdown, above Sign out", async () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    const link = within(header()).getByRole("link", { name: /^account$/i });
    expect(link.getAttribute("href")).toBe("/account");
  });

  it("offers a What's new link in the traveller dropdown", async () => {
    // /whats-new is the only route in this feature reachable exclusively
    // through this menu (the card links to /trips or a Trip's Home, never
    // here directly), which makes this the one drift test in the set that
    // actually guards a route with no other way in.
    mockUsePathname.mockReturnValue("/trips/t1");
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    const link = within(header()).getByRole("link", { name: /what's new/i });
    expect(link.getAttribute("href")).toBe("/whats-new");
  });

  // Task 11 (feedback cmuhvq385): no top app bar from 768px up.
  it("hides the top bar from md up — phones keep it", async () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    render(await AppLayout({ children: <div /> }));
    expect(header().className.split(/\s+/)).toContain("md:hidden");
    expect(header().className.split(/\s+/)).toContain("sticky");
  });

  it("mounts the sidebar outside a Trip, only from xl (≥1280px)", async () => {
    render(await AppLayout({ children: <div /> }));
    const sidebar = screen.getByTestId("sidebar");
    expect(sidebar.className.split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "xl:flex"]));
    // Outside a Trip: Trips/Globe only. With 0 trips (the default fixture
    // here), the switcher slot is hidden entirely (Task 11) — no placeholder.
    const nav = within(sidebar).getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Trips", "Globe"]);
    expect(within(sidebar).queryByRole("link", { name: "Choose a trip" })).toBeNull();
    expect(within(sidebar).getByRole("link", { name: /account/i }).textContent).toContain("Alice Test");
  });

  it("the Dock hands over to the sidebar at xl and pins to the top with no header offset", async () => {
    render(await AppLayout({ children: <div /> }));
    const dock = dockNav();
    const classes = dock.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["xl:hidden", "md:sticky", "md:top-0", "md:h-dvh"]));
    expect(dock.className).not.toContain("3.5rem");
  });

  // Controller ruling R1: at Dock widths the Dock carries search and the avatar menu.
  it("gives the Dock a search button and the Traveller's avatar menu (with a theme row)", async () => {
    render(await AppLayout({ children: <div /> }));
    const dock = dockNav();
    expect(within(dock).getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(within(dock).getByRole("button", { name: "Open traveller menu" })).toBeInTheDocument();
    expect(within(dock).getByRole("link", { name: /^account$/i }).getAttribute("href")).toBe("/account");
    expect(within(dock).getByText("Switch to dark theme")).toBeInTheDocument();
    expect(within(dock).getByText("Sign out")).toBeInTheDocument();
  });

  // ARCH-TEN-3c: /admin exists now, and must be discoverable — but only for
  // an ADMIN_EMAILS operator. Hiding it from everyone else is not access
  // control (requireAdmin() on the route and every action still is); this is
  // purely "can the operator find their own console."
  describe("the Admin nav entry", () => {
    it("is absent for an ordinary traveller", async () => {
      mockUsePathname.mockReturnValue("/trips/t1");
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      expect(screen.queryAllByRole("link", { name: /^admin/i })).toHaveLength(0);
    });

    it("appears for an ADMIN_EMAILS operator, linking to /admin", async () => {
      mockUsePathname.mockReturnValue("/trips/t1");
      process.env.ADMIN_EMAILS = "alice@example.com";
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      const link = within(header()).getByRole("link", { name: /^admin/i });
      expect(link.getAttribute("href")).toBe("/admin");
    });

    // Load-bearing, not decorative: notifyAdmins' push only reaches the
    // operator if they have a Device registered, so this count is often the
    // ONLY way they learn a request is waiting.
    it("shows a pending-count badge when Access requests are waiting", async () => {
      mockUsePathname.mockReturnValue("/trips/t1");
      process.env.ADMIN_EMAILS = "alice@example.com";
      accessRequestFindManyMock.mockResolvedValue([
        { id: "ar1", email: "a@example.com", name: null, image: null, createdAt: new Date(), lastAttemptAt: new Date(), attempts: 1 },
        { id: "ar2", email: "b@example.com", name: null, image: null, createdAt: new Date(), lastAttemptAt: new Date(), attempts: 1 },
      ]);
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      expect(within(header()).getByText("2")).toBeInTheDocument();
    });

    it("shows no badge when there are no pending Access requests", async () => {
      mockUsePathname.mockReturnValue("/trips/t1");
      process.env.ADMIN_EMAILS = "alice@example.com";
      accessRequestFindManyMock.mockResolvedValue([]);
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      const link = within(header()).getByRole("link", { name: /^admin/i });
      // Just "Admin" — no trailing count.
      expect(link.textContent?.trim()).toBe("Admin");
    });

    // The route must stay discoverable even when the count itself can't be
    // read — a DB hiccup on the badge must never take the whole link with it.
    it("still renders the Admin link even if the pending-count query fails", async () => {
      mockUsePathname.mockReturnValue("/trips/t1");
      process.env.ADMIN_EMAILS = "alice@example.com";
      accessRequestFindManyMock.mockRejectedValue(new Error("db down"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);

      expect(within(header()).getByRole("link", { name: /^admin/i }).getAttribute("href")).toBe("/admin");
      errorSpy.mockRestore();
    });
  });

  // Task 12, spec D4: on phones, trips-level pages swap the top bar for a
  // Trips / Globe / You tab bar; inside a Trip the top bar stays and the
  // trip's own MobileTabBar (unaffected here — the trip layout mounts it) is used
  // instead of the app-level one.
  describe("phone chrome on trips-level pages (Task 12, spec D4)", () => {
    it("on /trips: no phone top bar, the app tab bar is mounted", async () => {
      mockUsePathname.mockReturnValue("/trips");
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      // The phones-only top bar (OnTripPath) is gone entirely — not just
      // hidden — outside a Trip; the sidebar's own wordmark link (xl+,
      // unaffected by this task) keeps the same accessible name, so the
      // absence is asserted on <header>, not on the link itself.
      expect(document.querySelector("header")).toBeNull();
      const tabBar = tabBarNav();
      expect(within(tabBar).getByRole("link", { name: "Trips" })).toHaveAttribute("href", "/trips");
      expect(within(tabBar).getByRole("link", { name: "Globe" })).toHaveAttribute("href", "/globe");
      expect(within(tabBar).getByRole("link", { name: "You" })).toHaveAttribute("href", "/account");
    });

    it("inside a trip: the phone top bar stays and there is no app tab bar", async () => {
      mockUsePathname.mockReturnValue("/trips/t1/plan");
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      expect(
        within(header()).getByRole("link", { name: "Teepee — go to your trips" }),
      ).toBeInTheDocument();
      // Inside a Trip the rail's Dock is the trip-sections one and the app
      // tab bar is absent (OutsideTrip; MobileTabBar owns the trip's own).
      expect(screen.queryByRole("navigation", { name: "Teepee" })).not.toBeInTheDocument();
    });

    // ADR 0062, amended 2026-09-29: the app layout's AppShellRail is the only
    // rail, on trip paths too — rows from the URL before the trip layout
    // publishes anything, and a skeleton in the switcher slot.
    it("on a trip path mounts the trip rows and a skeleton switcher", async () => {
      mockUsePathname.mockReturnValue("/trips/t1/plan");
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      const dock = screen.getByRole("navigation", { name: "Trip sections" });
      expect(within(dock).getByRole("link", { name: "Plan" })).toHaveAttribute("href", "/trips/t1/plan");
      const sidebar = screen.getByTestId("sidebar");
      const nav = within(sidebar).getByRole("navigation", { name: "Main" });
      expect(within(nav).getByRole("link", { name: "Plan" })).toHaveAttribute("href", "/trips/t1/plan");
      expect(within(sidebar).getByTestId("sidebar-trip-skeleton")).toBeInTheDocument();
      expect(within(sidebar).queryByText("Back to")).toBeNull();
    });
  });

  // Task 12: the trip switcher's data (id/name/startDate/endDate/current-stop
  // timezone) is loaded once here and handed down through ShellUserProvider,
  // rather than re-queried by every trip page — see
  // components/shell/trip-switcher.tsx and app/(app)/trips/[tripId]/layout.tsx.
  describe("trip switcher data", () => {
    it("loads the signed-in Traveller's own trips, not anyone else's", async () => {
      tripMemberFindManyMock.mockResolvedValue([]);
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      expect(tripMemberFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" } }),
      );
    });

    it("selects what the switcher needs per trip: id, name, dates and (via stops) current-stop timezone", async () => {
      tripMemberFindManyMock.mockResolvedValue([]);
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      const call = tripMemberFindManyMock.mock.calls[0][0];
      expect(call.include.trip.select).toEqual(
        expect.objectContaining({
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          createdAt: true,
        }),
      );
      expect(call.include.trip.select.stops.select).toEqual(
        expect.objectContaining({ timezone: true, arriveDate: true, departDate: true }),
      );
    });
  });

  // Task 11, spec P1: the trips-level sidebar's "Back to" card — the most
  // recently opened trip (from the cookie), or the first trip in trips-list
  // order when the cookie is missing or names a trip the viewer isn't in.
  describe("the Back to trip card", () => {
    const TRIP_FIXTURE = {
      id: "trip-1",
      name: "Christmas in Europe",
      startDate: null,
      endDate: null,
      createdAt: new Date(),
      stops: [],
    };

    it("falls back to the first trip when there is no last-trip cookie", async () => {
      tripMemberFindManyMock.mockResolvedValue([{ trip: TRIP_FIXTURE }]);
      cookiesGetMock.mockReturnValue(undefined);
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      const sidebar = screen.getByTestId("sidebar");
      expect(within(sidebar).getByText("Back to")).toBeInTheDocument();
      const links = within(sidebar).getAllByRole("link", { name: /christmas in europe/i });
      expect(links.some((a) => a.getAttribute("href") === "/trips/trip-1")).toBe(true);
      expect(within(sidebar).queryByRole("link", { name: "Choose a trip" })).toBeNull();
    });

    it("ignores a cookie for a trip the viewer isn't in", async () => {
      tripMemberFindManyMock.mockResolvedValue([{ trip: TRIP_FIXTURE }]);
      cookiesGetMock.mockReturnValue({ value: "not-a-member-of-this-one" });
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      const sidebar = screen.getByTestId("sidebar");
      expect(within(sidebar).getAllByRole("link", { name: /christmas in europe/i }).length).toBeGreaterThan(0);
    });
  });
});
