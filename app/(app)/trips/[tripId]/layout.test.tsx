import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

// layout.tsx is an async server component. DB access, server actions and leaf
// components are mocked; leaf components are marker-mocked so we can assert
// presence/absence and props without depending on their internals.
//
// Device reporting (formerly PushTimezoneSync, mounted here with a
// `pushSubscription.findFirst` query feeding it) moved to DeviceSync, mounted
// app-wide in app/(app)/layout.tsx instead — see
// components/account/device-sync.test.tsx for its coverage. This layout no
// longer reads pushSubscription at all.

const mockDb = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  attachment: { findMany: vi.fn() },
}));

const requireTripAccessMock = vi.hoisted(() =>
  vi.fn(async () => ({
    user: { id: "owner-1", email: "owner@example.com" },
    membership: { userId: "owner-1", role: "owner" },
  })),
);

// TripHeaderFrame (client) reads the pathname to hide the header on Home at lg+.
const mockUsePathname = vi.hoisted(() => vi.fn(() => "/trips/trip-1/plan"));
// SectionTransition (ADR 0063) reads this from the layout.
vi.mock("next/navigation", () => ({ notFound: vi.fn(), usePathname: () => mockUsePathname(), useSelectedLayoutSegment: () => null }));
// The md+ rail is AppShellRail in the app layout (ADR 0062, amended
// 2026-09-29); this layout only publishes the Trip into it. Marker-mock the
// publisher so what it publishes (id, slug, Days target, switcher, counts) is
// inspectable here.
vi.mock("@/components/shell/rail-trip", () => ({
  RailTripPublisher: ({
    id,
    slug,
    daysHref,
    switcher,
    counts,
  }: {
    id: string;
    slug: string;
    name: string;
    daysHref: string | null;
    switcher?: React.ReactNode;
    counts?: { Plan?: React.ReactNode; Wishlist?: React.ReactNode; Money?: React.ReactNode };
  }) => (
    <div
      data-testid="rail-trip"
      data-trip-id={id}
      data-slug={slug}
      data-days-href={daysHref ?? ""}
      data-has-plan-count={counts?.Plan ? "yes" : "no"}
      data-has-wishlist-count={counts?.Wishlist ? "yes" : "no"}
      data-has-money-count={counts?.Money ? "yes" : "no"}
    >
      {switcher}
    </div>
  ),
}));
// The real TripSwitcherFromContext reads ShellUserProvider, which this
// isolated layout test doesn't mount — marker-mock it (Task 12), like the
// other leaf components below, so the switcher slot and the header's compact
// pill both render something inspectable instead of null.
vi.mock("@/components/shell/trip-switcher", () => ({
  TripSwitcherFromContext: ({
    tripId,
    fallbackName,
    variant,
  }: {
    tripId: string;
    fallbackName: string;
    variant?: "card" | "pill";
  }) => (
    <div data-testid={`trip-switcher-${variant ?? "card"}`} data-trip-id={tripId}>
      {fallbackName}
    </div>
  ),
}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
}));
vi.mock("@/server/actions/activity", () => ({
  getUnreadActivityCount: vi.fn(async () => 0),
  getRecentActivity: vi.fn(async () => []),
}));
vi.mock("@/server/actions/forks", () => ({
  listForks: vi.fn(async () => []),
}));
vi.mock("@/components/trip/mobile-tab-bar", () => ({ MobileTabBar: () => null }));
vi.mock("@/components/trip/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/trip/fork-switcher", () => ({
  ForkSwitcher: () => <div data-testid="fork-switcher" />,
}));
vi.mock("@/components/offline-warmer", () => ({ OfflineWarmer: () => null }));
vi.mock("@/components/feedback/feedback-trip-marker", () => ({
  FeedbackTripMarker: () => null,
}));

const { default: TripLayout, generateMetadata } = await import("./layout");

const BASE_TRIP = {
  id: "trip-1",
  name: "Test Trip",
  startDate: "2026-01-01",
  endDate: "2026-01-10",
  homeCurrency: "GBP",
  members: [],
  stops: [],
  forksEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.trip.findUnique.mockResolvedValue(BASE_TRIP);
  mockDb.attachment.findMany.mockResolvedValue([]);
  mockUsePathname.mockReturnValue("/trips/trip-1/plan");
});

async function renderLayout() {
  const jsx = await TripLayout({
    children: <div>child content</div>,
    params: Promise.resolve({ tripId: "trip-1" }),
  });
  render(jsx);
}

describe("TripLayout", () => {
  it("renders without querying pushSubscription — device reporting moved to DeviceSync app-wide", async () => {
    await renderLayout();

    expect(mockDb.trip.findUnique).toHaveBeenCalled();
    expect(screen.getByText("Test Trip", { selector: "h1" })).toBeInTheDocument();
    expect(screen.queryByTestId("push-timezone-sync")).not.toBeInTheDocument();
  });

  it("marks the trip header block with data-trip-header (hook for the print route's hide list)", async () => {
    await renderLayout();
    const header = document.querySelector("[data-trip-header]");
    expect(header).toBeInTheDocument();
    expect(header).toContainElement(screen.getByText("Test Trip", { selector: "h1" }));
  });

  it("marks the trip shell and centres content at the wide width right of the rail", async () => {
    await renderLayout();
    const shell = document.querySelector("[data-trip-shell]")!;
    expect(shell).not.toBeNull();
    const content = document.querySelector("[data-trip-content]")!;
    expect(content.className).toContain("min-w-0");
    expect(content.className).toContain("flex-1");
    expect(content.firstElementChild!.className).toContain("max-w-page-wide");
  });

  // Controller ruling R2: the layout's header stays below lg everywhere; on
  // Home and the Day view it is lg:hidden (those pages render their own
  // desktop header — Task 15; spec 2026-09-27 §C, where the date is the h1).
  it("hides the trip header at lg+ on Home", async () => {
    mockUsePathname.mockReturnValue("/trips/trip-1");
    await renderLayout();
    const header = document.querySelector("[data-trip-header]")!;
    expect(header.className.split(/\s+/)).toContain("lg:hidden");
  });

  // The Day view hides it at every width: its own header carries the switcher
  // pill and bell below lg (Task 11, one h1 = the date).
  it.each(["/trips/trip-1/day", "/trips/trip-1/day/2026-01-02"])(
    "hides the trip header at every width on %s",
    async (path) => {
      mockUsePathname.mockReturnValue(path);
      await renderLayout();
      const header = document.querySelector("[data-trip-header]")!;
      expect(header.className.split(/\s+/)).toContain("hidden");
    },
  );

  it.each(["/trips/trip-1/settings"])(
    "keeps the trip header at every width on %s",
    async (path) => {
      mockUsePathname.mockReturnValue(path);
      await renderLayout();
      const header = document.querySelector("[data-trip-header]")!;
      expect(header.className).not.toContain("hidden");
      expect(header).toContainElement(screen.getByText("Test Trip", { selector: "h1" }));
    },
  );

  it.each(["files", "activity", "compare", "journal", "more", "help", "budget", "plan", "checklists", "calendar", "wishlist"])(
    "hides the trip header at every width on the PageHeader route /%s",
    async (seg) => {
      mockUsePathname.mockReturnValue(`/trips/trip-1/${seg}`);
      await renderLayout();
      expect(document.querySelector("[data-trip-header]")!.className.split(/\s+/)).toContain("hidden");
    },
  );

  it("publishes this Trip into the persistent rail, with the trip name in the switcher slot", async () => {
    await renderLayout();
    const sidebar = screen.getByTestId("rail-trip");
    expect(sidebar).toHaveAttribute("data-trip-id", "trip-1");
    expect(sidebar).toHaveAttribute("data-slug", "trip-1");
    expect(sidebar).toHaveAttribute("data-days-href", "/trips/trip-1/day/2026-01-01");
    expect(sidebar).toHaveTextContent("Test Trip");
  });

  it("mounts no rail of its own (AppShellRail in the app layout is the only one)", async () => {
    await renderLayout();
    expect(screen.queryByRole("navigation", { name: "Trip sections" })).toBeNull();
    expect(screen.queryByTestId("sidebar")).toBeNull();
  });

  // Task 12: the sidebar's switcher slot is the full "card" switcher; the
  // trip header additionally carries a compact "pill" one for 768–1279px
  // (the Dock band — the full sidebar isn't there yet, and the header's own
  // ?plan= threading has nothing to do with which trip is in view).
  it("publishes the card-variant switcher for the sidebar slot", async () => {
    await renderLayout();
    const sidebar = screen.getByTestId("rail-trip");
    expect(within(sidebar).getByTestId("trip-switcher-card")).toHaveAttribute("data-trip-id", "trip-1");
  });

  it("publishes Suspense-wrapped Plan/Wishlist/Money counts for the sidebar (Task 12; Money added Phase 1 Task 7)", async () => {
    await renderLayout();
    const sidebar = screen.getByTestId("rail-trip");
    expect(sidebar).toHaveAttribute("data-has-plan-count", "yes");
    expect(sidebar).toHaveAttribute("data-has-wishlist-count", "yes");
    expect(sidebar).toHaveAttribute("data-has-money-count", "yes");
  });

  it("puts a pill-variant switcher in the trip header, shown only 768–1279px (md:flex xl:hidden)", async () => {
    await renderLayout();
    const pill = screen.getByTestId("trip-switcher-pill");
    expect(pill).toHaveAttribute("data-trip-id", "trip-1");
    const band = pill.parentElement!;
    for (const c of ["hidden", "md:flex", "xl:hidden"]) {
      expect(band.className.split(/\s+/)).toContain(c);
    }
  });

  // LA-050: the avatar stack becomes one 44px link to Settings → Travellers,
  // with an accessible name that includes the member count.
  it("member avatars are one 44px link to the travellers settings", async () => {
    mockDb.trip.findUnique.mockResolvedValue({
      ...BASE_TRIP,
      members: [
        { user: { id: "u1", name: "Alice", image: null } },
        { user: { id: "u2", name: "Bob", image: null } },
      ],
    });
    await renderLayout();
    const link = screen.getByRole("link", { name: /trip members \(2\)/i });
    expect(link).toHaveAttribute("href", "/trips/trip-1/settings#travellers");
    expect(link.className).toContain("min-h-11");
  });
});

describe("TripLayout — plan variants opt-in", () => {
  // A trip in the planning phase: dates well in the future.
  const PLANNING_TRIP = { ...BASE_TRIP, startDate: "2099-01-01", endDate: "2099-01-10" };

  it("hides the ForkSwitcher when plan variants are off, even in the planning phase", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...PLANNING_TRIP, forksEnabled: false });
    await renderLayout();
    expect(screen.queryByTestId("fork-switcher")).not.toBeInTheDocument();
  });

  it("shows the ForkSwitcher when plan variants are on in the planning phase", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...PLANNING_TRIP, forksEnabled: true });
    await renderLayout();
    expect(screen.getByTestId("fork-switcher")).toBeInTheDocument();
  });

  it("selects forksEnabled from the trip", async () => {
    await renderLayout();
    expect(mockDb.trip.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ forksEnabled: true }) }),
    );
  });
});

describe("generateMetadata", () => {
  it("titles the trip home with the trip name and subpages page-first", async () => {
    mockDb.trip.findUnique.mockResolvedValueOnce({ name: "Test Trip" });
    const md = await generateMetadata({ params: Promise.resolve({ tripId: "trip-1" }) });
    expect(md).toEqual({
      title: { default: "Test Trip", template: "%s · Test Trip · Teepee" },
    });
  });

  it("returns no title when the trip is gone, so the root 'Teepee' stands", async () => {
    mockDb.trip.findUnique.mockResolvedValueOnce(null);
    const md = await generateMetadata({ params: Promise.resolve({ tripId: "trip-1" }) });
    expect(md).toEqual({});
  });

  it("guards access before reading the trip name", async () => {
    mockDb.trip.findUnique.mockResolvedValueOnce({ name: "Test Trip" });
    await generateMetadata({ params: Promise.resolve({ tripId: "trip-1" }) });
    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
  });
});
