import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { requireUserMock, tripMemberFindManyMock, stopFindManyMock, activityCountMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  tripMemberFindManyMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  activityCountMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/db", () => ({
  db: {
    tripMember: { findMany: tripMemberFindManyMock },
    // The page unconditionally queries cover-fallback stops before checking
    // whether there are any trips at all, so this needs stubbing too even for
    // the empty-state case.
    stop: { findMany: stopFindManyMock },
    // Only hit once there's at least one trip (unread-activity count per trip).
    activity: { count: activityCountMock },
  },
}));

// next/link renders a plain <a> in jsdom
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

// Client/heavy children the empty state never renders — stub to keep the
// jsdom render cheap and free of client-only hooks.
vi.mock("@/components/trip/trip-card", () => ({ TripCard: () => null }));
vi.mock("@/components/ui/animated-list", () => ({
  AnimatedList: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  AnimatedItem: ({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
  }) => <div data-testid="animated-item" className={className}>{children}</div>,
}));

// WhatsNewBanner reads the database directly and is covered by its own test
// — stub it here so this page test doesn't also have to stand up a
// db.user.findUnique mock just to satisfy an unrelated component.
vi.mock("@/components/whats-new/whats-new-banner", () => ({
  WhatsNewBanner: () => null,
}));

import TripsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "u1", name: "Sis", email: "sis@example.com" });
  tripMemberFindManyMock.mockResolvedValue([]);
  stopFindManyMock.mockResolvedValue([]);
  activityCountMock.mockResolvedValue(0);
});

describe("TripsPage empty state", () => {
  it("offers the help guide alongside creating the first trip", async () => {
    render(await TripsPage());

    expect(screen.getByText("No trips yet")).toBeInTheDocument();

    const helpLink = screen.getByRole("link", { name: /how to use teepee/i });
    expect(helpLink).toHaveAttribute("href", "/help");

    // "New trip" stays the primary action (header + empty state).
    const newTripLinks = screen.getAllByRole("link", { name: /new trip/i });
    expect(newTripLinks.some((a) => a.getAttribute("href") === "/trips/new")).toBe(true);
  });
});

describe("TripsPage grid — dashed 'new trip' tile", () => {
  it("shows exactly one accessible 'Start a new trip' link, matching the kit for its breakpoint", async () => {
    const trip = {
      id: "trip-1",
      name: "Test Trip",
      startDate: null,
      endDate: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      coverImageKey: null,
      homeLat: null,
      homeLng: null,
      roundTrip: false,
      _count: { stops: 0 },
      stops: [] as unknown[],
    };
    tripMemberFindManyMock.mockResolvedValue([
      { tripId: trip.id, lastReadActivityAt: null, trip },
    ]);

    render(await TripsPage());

    // Two DOM nodes exist for this one affordance — DTrips.jsx's in-grid dashed
    // Card (desktop, `hidden lg:flex`) and Trips.jsx's full-width dashed Button
    // below the grid (mobile, `lg:hidden`) — because jsdom applies no real CSS
    // cascade, both render regardless of viewport (there is no live media query
    // to resolve). What IS checkable without a live cascade is the Tailwind
    // mobile-first contract itself: exactly one of the two carries the base,
    // unprefixed `hidden` token, so exactly one is visible/accessible at the
    // default (no `lg:` match) width the mobile kit targets, and it must come
    // back via `lg:hidden`/`lg:flex` at the desktop breakpoint — never both at
    // once.
    const links = screen.getAllByRole("link", { name: /start a new trip/i });
    expect(links).toHaveLength(2);
    links.forEach((link) => expect(link).toHaveAttribute("href", "/trips/new"));

    const hasBaseHiddenToken = (el: HTMLElement) => el.className.split(/\s+/).includes("hidden");
    const visibleByDefault = links.filter((l) => !hasBaseHiddenToken(l));
    const hiddenByDefault = links.filter(hasBaseHiddenToken);

    expect(visibleByDefault).toHaveLength(1);
    expect(hiddenByDefault).toHaveLength(1);
    // The one hidden by default (desktop's in-grid Card) reappears at `lg`.
    expect(hiddenByDefault[0].className).toMatch(/\blg:flex\b/);
    // The one visible by default (mobile's full-width Button) hides at `lg`.
    expect(visibleByDefault[0].className).toMatch(/\blg:hidden\b/);
  });
});

describe("TripsPage grid — even rows", () => {
  it("gives every trip's AnimatedItem h-full so cards stretch to match their row", async () => {
    const trip = {
      id: "trip-1",
      name: "Test Trip",
      startDate: null,
      endDate: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      coverImageKey: null,
      homeLat: null,
      homeLng: null,
      roundTrip: false,
      _count: { stops: 0 },
      stops: [] as unknown[],
    };
    const trip2 = { ...trip, id: "trip-2", name: "Another Trip" };
    tripMemberFindManyMock.mockResolvedValue([
      { tripId: trip.id, lastReadActivityAt: null, trip },
      { tripId: trip2.id, lastReadActivityAt: null, trip: trip2 },
    ]);

    render(await TripsPage());

    const items = screen.getAllByTestId("animated-item");
    expect(items.length).toBe(2);
    items.forEach((item) => expect(item.className).toContain("h-full"));
  });
});
