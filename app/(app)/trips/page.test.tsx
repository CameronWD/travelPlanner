import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { requireUserMock, tripMemberFindManyMock, stopFindManyMock, activityCountMock, loadNextStepsMock, tripCardMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  tripMemberFindManyMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  activityCountMock: vi.fn(),
  loadNextStepsMock: vi.fn(),
  tripCardMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/next-steps-loader", () => ({ loadNextSteps: loadNextStepsMock }));
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
// jsdom render cheap and free of client-only hooks. Records every call so
// tests can assert on the props (e.g. featuredDetails) the page computed.
vi.mock("@/components/trip/trip-card", () => ({
  TripCard: (props: Record<string, unknown>) => {
    tripCardMock(props);
    return null;
  },
}));
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
  loadNextStepsMock.mockResolvedValue([]);
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

describe("TripsPage — featured card's next step", () => {
  it("passes the featured trip's real next step (from loadNextSteps), not the countdown, and loads it for only that trip", async () => {
    const makeTrip = (id: string, startDate: string) => ({
      id,
      name: `Trip ${id}`,
      startDate,
      endDate: "2030-01-10",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      coverImageKey: null,
      homeLat: null,
      homeLng: null,
      roundTrip: false,
      _count: { stops: 2 },
      stops: [] as unknown[],
    });
    // Both far-future "planning" trips; trip-1 starts soonest, so it's featured.
    const trip1 = makeTrip("trip-1", "2030-01-01");
    const trip2 = makeTrip("trip-2", "2030-06-01");
    tripMemberFindManyMock.mockResolvedValue([
      { tripId: trip1.id, lastReadActivityAt: null, trip: trip1 },
      { tripId: trip2.id, lastReadActivityAt: null, trip: trip2 },
    ]);
    loadNextStepsMock.mockResolvedValue([{ id: "nudge-unbooked-transport", title: "Book transport", href: "/trips/trip-1/plan", severity: "info", source: "nudge" }]);

    render(await TripsPage());

    // Only the featured (first-sorted) trip's next steps are loaded.
    expect(loadNextStepsMock).toHaveBeenCalledTimes(1);
    expect(loadNextStepsMock).toHaveBeenCalledWith("trip-1", expect.any(String));

    const featuredCall = tripCardMock.mock.calls.find((c) => c[0].id === "trip-1")![0];
    expect(featuredCall.featuredDetails.nextStep).toBe("Book transport");
    // Never a restatement of the countdown already shown beside it.
    expect(featuredCall.featuredDetails.nextStep).not.toBe(featuredCall.phase.countdown);

    const otherCall = tripCardMock.mock.calls.find((c) => c[0].id === "trip-2")![0];
    expect(otherCall.featuredDetails).toBeUndefined();
  });

  it("passes nextStep: null when loadNextSteps returns no steps", async () => {
    const trip = {
      id: "trip-1",
      name: "Trip One",
      startDate: "2030-01-01",
      endDate: "2030-01-10",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      coverImageKey: null,
      homeLat: null,
      homeLng: null,
      roundTrip: false,
      _count: { stops: 1 },
      stops: [] as unknown[],
    };
    tripMemberFindManyMock.mockResolvedValue([{ tripId: trip.id, lastReadActivityAt: null, trip }]);
    loadNextStepsMock.mockResolvedValue([]);

    render(await TripsPage());

    const featuredCall = tripCardMock.mock.calls.find((c) => c[0].id === "trip-1")![0];
    expect(featuredCall.featuredDetails.nextStep).toBeNull();
  });
});

describe("TripsPage cover focal point (spec E2)", () => {
  it("hands each TripCard its Trip's cover focal point", async () => {
    const trip = {
      id: "trip-1",
      name: "Test Trip",
      startDate: null,
      endDate: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      coverImageKey: "trips/trip-1/k.webp",
      coverFocalX: 0.3,
      coverFocalY: 0.6,
      homeLat: null,
      homeLng: null,
      roundTrip: false,
      _count: { stops: 0 },
      stops: [] as unknown[],
    };
    tripMemberFindManyMock.mockResolvedValue([{ tripId: trip.id, lastReadActivityAt: null, trip }]);

    render(await TripsPage());

    expect(tripCardMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "trip-1", focalX: 0.3, focalY: 0.6 }),
    );
  });
});
