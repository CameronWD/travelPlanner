import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips/t1/plan");
const mockUseSearchParams = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/server/actions/search", () => ({
  searchTrip: vi.fn(async () => []),
  listMyTrips: vi.fn(async () => []),
}));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
// Radix only renders menu content when open; stub so the menu is inspectable.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => <button {...props}>{children}</button>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div data-testid="account-menu">{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip Radix-only props before they reach the DOM
  DropdownMenuItem: ({ children, onSelect: _onSelect, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode; onSelect?: unknown }) => <div {...props}>{children}</div>,
}));
import { Sidebar, SidebarTripPlaceholder, SidebarTripSkeleton } from "./sidebar";
import { DaysHrefProvider } from "@/components/trip/days-href-context";
import { EMPTY_ADMIN_QUEUE } from "@/lib/admin-queue";

const USER = {
  id: "u1",
  name: "Alice Provider",
  email: "alice@example.com",
  image: null,
  displayName: "Al",
  photoKey: null,
  photoUpdatedAt: null,
};
const TRIP = { id: "t1", name: "Europe 2026" };

function renderSidebar(
  opts: {
    trip?: typeof TRIP | null;
    isAdmin?: boolean;
    pending?: number;
    trips?: { id: string; name: string; statusLine: string; slug: string }[];
    switcher?: React.ReactNode;
  } = {},
) {
  const trip = opts.trip === undefined ? TRIP : opts.trip;
  return render(
    <Sidebar
      user={USER}
      isAdmin={opts.isAdmin ?? false}
      adminQueue={{ accessRequests: opts.pending ?? 0, feedbackNeedingReview: 0 }}
      trip={trip}
      trips={opts.trips}
      switcher={opts.switcher ?? <SidebarTripPlaceholder trip={trip} />}
    />,
  );
}

const mainNav = () => screen.getByRole("navigation", { name: "Main" });
const navLinks = () => within(mainNav()).getAllByRole("link");

beforeEach(() => {
  mockUsePathname.mockReturnValue("/trips/t1/plan");
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
});

describe("Sidebar", () => {
  it("is the ≥1280px chrome: hidden below xl, sticky at full height, 248px sun", () => {
    renderSidebar();
    const aside = screen.getByTestId("sidebar");
    for (const c of ["hidden", "xl:flex", "sticky", "top-0", "h-dvh", "w-[248px]", "bg-sun", "border-r-2", "border-border", "py-[22px]", "px-4"]) {
      expect(aside.className.split(/\s+/)).toContain(c);
    }
  });

  it("renders exactly one lockup link, to /trips", () => {
    renderSidebar();
    const lockups = screen.getAllByRole("link", { name: "Teepee — go to your trips" });
    expect(lockups).toHaveLength(1);
    expect(lockups[0].getAttribute("href")).toBe("/trips");
    expect(within(lockups[0]).getByRole("img", { name: "Teepee" })).toBeInTheDocument();
  });

  it("inside a trip renders the thirteen trip sections in order, then Trips and Globe", () => {
    renderSidebar();
    expect(navLinks().map((a) => a.textContent)).toEqual([
      "Home", "Plan", "Days", "Calendar", "Money", "Wishlist",
      "Journal", "Checklists", "Files", "Summary", "Activity",
      "Settings", "Help", "Trips", "Globe",
    ]);
  });

  it("marks Plan aria-current on /trips/t1/plan, and nothing else", () => {
    renderSidebar();
    const current = navLinks().filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual(["Plan"]);
    expect(current[0].className).toContain("bg-coral");
    expect(current[0].className).toContain("shadow-hard-1");
  });

  it("styles rows 42px, radius-12, 15px bold; inactive rows keep a transparent border", () => {
    renderSidebar();
    const home = within(mainNav()).getByRole("link", { name: "Home" });
    for (const c of ["h-[42px]", "rounded-[12px]", "px-3", "text-[15px]", "font-bold", "border-2", "border-transparent", "hover:border-border"]) {
      expect(home.className.split(/\s+/)).toContain(c);
    }
    expect(home.parentElement!.className).toContain("py-px");
  });

  it("keeps ?plan=f1 on Plan and Money hrefs, not on Days", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("plan=f1"));
    renderSidebar();
    const href = (name: string) => within(mainNav()).getByRole("link", { name }).getAttribute("href");
    expect(href("Plan")).toBe("/trips/t1/plan?plan=f1");
    expect(href("Money")).toBe("/trips/t1/budget?plan=f1");
    expect(href("Days")).toBe("/trips/t1/day");
    expect(href("Calendar")).toBe("/trips/t1/calendar");
  });

  it("lights Days on a single day page, and Settings (not More, which no longer exists) on Settings", () => {
    mockUsePathname.mockReturnValue("/trips/t1/day/2026-12-04");
    const { unmount } = renderSidebar();
    expect(navLinks().filter((a) => a.getAttribute("aria-current")).map((a) => a.textContent)).toEqual(["Days"]);
    unmount();
    mockUsePathname.mockReturnValue("/trips/t1/settings");
    renderSidebar();
    expect(navLinks().filter((a) => a.getAttribute("aria-current")).map((a) => a.textContent)).toEqual(["Settings"]);
    expect(screen.queryByRole("link", { name: "More" })).toBeNull();
  });

  it("links Days at the default day from DaysHrefProvider (ADR 0063)", () => {
    render(
      <DaysHrefProvider href="/trips/t1/day/2026-12-04">
        <Sidebar user={USER} isAdmin={false} adminQueue={EMPTY_ADMIN_QUEUE} trip={TRIP} switcher={<SidebarTripPlaceholder trip={TRIP} />} />
      </DaysHrefProvider>,
    );
    const href = (name: string) => within(mainNav()).getByRole("link", { name }).getAttribute("href");
    expect(href("Days")).toBe("/trips/t1/day/2026-12-04");
    expect(href("Calendar")).toBe("/trips/t1/calendar");
  });

  // AppShellRail (ADR 0062, amended 2026-09-29): before the trip layout
  // publishes, the rail knows only the URL ref — the rows link with it.
  it("builds trip hrefs from trip.ref and trip.daysHref when given, with no name yet", () => {
    mockUsePathname.mockReturnValue("/trips/christmas/plan");
    render(
      <Sidebar
        user={USER}
        isAdmin={false}
        adminQueue={EMPTY_ADMIN_QUEUE}
        trip={{ id: "t1", name: null, ref: "christmas", daysHref: null }}
        switcher={<SidebarTripSkeleton />}
      />,
    );
    const href = (name: string) => within(mainNav()).getByRole("link", { name }).getAttribute("href");
    expect(href("Plan")).toBe("/trips/christmas/plan");
    expect(href("Home")).toBe("/trips/christmas");
    expect(href("Days")).toBe("/trips/christmas/day");
    expect(within(mainNav()).getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("sidebar-trip-skeleton")).toHaveAttribute("aria-hidden", "true");
  });

  it("prefers trip.daysHref over DaysHrefProvider", () => {
    render(
      <DaysHrefProvider href="/trips/t1/day/2026-01-01">
        <Sidebar user={USER} isAdmin={false} adminQueue={EMPTY_ADMIN_QUEUE} trip={{ ...TRIP, ref: "europe", daysHref: "/trips/europe/day/2026-12-04" }} switcher={null} />
      </DaysHrefProvider>,
    );
    expect(within(mainNav()).getByRole("link", { name: "Days" })).toHaveAttribute("href", "/trips/europe/day/2026-12-04");
  });

  it("lights Calendar only on /trips/t1/calendar", () => {
    mockUsePathname.mockReturnValue("/trips/t1/calendar");
    renderSidebar();
    expect(navLinks().filter((a) => a.getAttribute("aria-current")).map((a) => a.textContent)).toEqual(["Calendar"]);
  });

  it("renders the Across trips eyebrow with Trips and Globe", () => {
    renderSidebar();
    const eyebrow = screen.getByText("Across trips");
    expect(eyebrow.className).toContain("uppercase");
    const href = (name: string) => within(mainNav()).getByRole("link", { name }).getAttribute("href");
    expect(href("Trips")).toBe("/trips");
    expect(href("Globe")).toBe("/globe");
  });

  it("shows the section eyebrows Plan it and Keep, and an icon on every trip row", () => {
    renderSidebar(); // defaults to /trips/t1/plan, set in beforeEach
    expect(screen.getByText("Plan it")).toBeInTheDocument();
    expect(screen.getByText("Keep")).toBeInTheDocument();
    const home = screen.getByRole("link", { name: "Home" });
    expect(home.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("has no Today item", () => {
    renderSidebar();
    expect(within(mainNav()).queryByRole("link", { name: /today/i })).toBeNull();
  });

  it("shows the trip name in the switcher slot placeholder", () => {
    renderSidebar();
    expect(screen.getByText("Europe 2026")).toBeInTheDocument();
  });

  const FOUR_TRIPS = [
    { ...TRIP, statusLine: "", slug: "t1" },
    { id: "t2", name: "Japan", statusLine: "", slug: "t2" },
    { id: "t3", name: "NZ", statusLine: "", slug: "t3" },
    { id: "t4", name: "Peru", statusLine: "", slug: "t4" },
  ];
  const findTripsRow = () => navLinks().find((a) => a.getAttribute("href") === "/trips")!;

  it("shows the Trips row count on a trips-level page (outside a Trip), and hides it at 0", () => {
    const withTrips = renderSidebar({ trip: null, trips: FOUR_TRIPS });
    expect(within(findTripsRow()).getByText("4")).toBeInTheDocument();
    withTrips.unmount();

    renderSidebar({ trip: null, trips: [] });
    expect(within(findTripsRow()).queryByText("0")).toBeNull();
  });

  // Controller ruling: the count is a trips-level affordance only — inside a
  // Trip the Trips row is a plain nav link, count or no.
  it("never shows the Trips row count inside a Trip, even with several trips", () => {
    renderSidebar({ trip: TRIP, trips: FOUR_TRIPS });
    expect(within(findTripsRow()).queryByText("4")).toBeNull();
  });

  it("hides the switcher slot when the user has 0 trips, and widens the gap under search", () => {
    renderSidebar({ trip: null, trips: [], switcher: <div data-testid="switcher" /> });
    expect(screen.queryByTestId("switcher")).toBeNull();
    const aside = screen.getByTestId("sidebar");
    const combobox = within(aside).getByRole("combobox", { name: /search or jump/i });
    let searchWrapper: HTMLElement | null = combobox;
    while (searchWrapper && searchWrapper.parentElement !== aside) searchWrapper = searchWrapper.parentElement;
    expect(searchWrapper).not.toBeNull();
    expect(searchWrapper!.className).toContain("mb-6");
  });

  it("outside a trip: no trip nav, the switcher reads Choose a trip, Trips lit on /trips", () => {
    mockUsePathname.mockReturnValue("/trips");
    renderSidebar({ trip: null, trips: [{ ...TRIP, statusLine: "", slug: "t1" }] });
    expect(navLinks().map((a) => a.getAttribute("href"))).toEqual(["/trips", "/globe"]);
    expect(screen.getByRole("link", { name: "Choose a trip" }).getAttribute("href")).toBe("/trips");
    const tripsRow = navLinks().find((a) => a.getAttribute("href") === "/trips")!;
    expect(tripsRow.getAttribute("aria-current")).toBe("page");
  });

  it("renders the inline search field (a real input, no ⌘K keycap)", () => {
    renderSidebar();
    const aside = screen.getByTestId("sidebar");
    const input = within(aside).getByRole("combobox", { name: /search or jump/i });
    expect(input.tagName).toBe("INPUT");
    expect(aside.querySelector("kbd")).toBeNull();
    expect(within(aside).queryByText("⌘K")).not.toBeInTheDocument();
  });

  describe("footer", () => {
    it("shows the display name and an Account link", () => {
      renderSidebar();
      const aside = screen.getByTestId("sidebar");
      const account = within(aside).getByRole("link", { name: /account/i });
      expect(account.getAttribute("href")).toBe("/account");
      expect(account.textContent).toContain("Al");
      expect(account.textContent).not.toContain("Alice Provider");
    });

    // Dark mode is parked (spec 2026-10-04 §F).
    it("has no theme toggle", () => {
      renderSidebar();
      expect(within(screen.getByTestId("sidebar")).queryByRole("button", { name: /theme/i })).toBeNull();
    });

    it("the avatar opens a menu with Help, What's new and Sign out (Account sits beside it; no theme row)", () => {
      renderSidebar();
      expect(screen.getByRole("button", { name: "Open traveller menu" })).toBeInTheDocument();
      const menu = screen.getByTestId("account-menu");
      expect(within(menu).getByRole("link", { name: /how to use teepee/i }).getAttribute("href")).toBe("/help");
      expect(within(menu).getByRole("link", { name: /what's new/i }).getAttribute("href")).toBe("/whats-new");
      expect(within(menu).getByText("Sign out")).toBeInTheDocument();
      expect(within(menu).queryByRole("link", { name: /^account$/i })).toBeNull();
      expect(within(menu).queryByRole("link", { name: /^admin/i })).toBeNull();
      expect(within(menu).queryByText(/switch to (dark|light) theme/i)).toBeNull();
    });

    it("shows Admin with its pending badge for an admin", () => {
      renderSidebar({ isAdmin: true, pending: 3 });
      const menu = screen.getByTestId("account-menu");
      const admin = within(menu).getByRole("link", { name: /^admin/i });
      expect(admin.getAttribute("href")).toBe("/admin");
      expect(within(admin).getByLabelText("3 access requests waiting")).toBeInTheDocument();
      const trigger = screen.getByRole("button", { name: "Open traveller menu, 3 waiting in Admin" });
      expect(within(trigger).getByTestId("admin-queue-dot")).toBeInTheDocument();
    });

    it("shows no dot for an admin with an empty queue", () => {
      renderSidebar({ isAdmin: true, pending: 0 });
      expect(screen.getByRole("button", { name: "Open traveller menu" })).toBeInTheDocument();
      expect(screen.queryByTestId("admin-queue-dot")).toBeNull();
    });
  });
});
