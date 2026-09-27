import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { formatDateRange } from "@/lib/dates";
// React import needed for JSX in the mocks below (vi.mock calls are hoisted
// above every import, so this being written before or after them doesn't
// change execution order — top-of-file here purely for readability).
import React from "react";

/**
 * Trip Home, composed the way Next.js actually renders it: the trip layout
 * ("./layout") wraps the page ("./page") as `children`. The trip name <h1>
 * and the date range live in the layout (out of this task's file scope —
 * see task-10-brief.md), not the page — so the only way to truthfully pin
 * "the trip name is the page h1" and "dates render" is to render both
 * together, exactly as the router does. Everything except the two files
 * under test (layout, page) and their shared data layer is mocked, the same
 * way layout.test.tsx already does it.
 */

const mockDb = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  stop: { findMany: vi.fn() },
  transport: { findFirst: vi.fn() },
  attachment: { findMany: vi.fn() },
}));

const requireTripAccessMock = vi.hoisted(() =>
  vi.fn(async () => ({
    user: { id: "owner-1", email: "owner@example.com" },
    membership: { userId: "owner-1", role: "owner" },
  })),
);

// TripHeaderFrame reads the pathname (Home hides the layout header at lg+).
vi.mock("next/navigation", () => ({ notFound: vi.fn(), usePathname: () => "/trips/trip-1" }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/server/actions/activity", () => ({
  getUnreadActivityCount: vi.fn(async () => 0),
  getRecentActivity: vi.fn(async () => []),
}));
vi.mock("@/server/actions/forks", () => ({
  listForks: vi.fn(async () => []),
}));
vi.mock("@/server/actions/reminders", () => ({
  listRemindersForTrip: vi.fn(async () => []),
}));
vi.mock("@/components/trip/trip-nav", () => ({ TripNav: () => null }));
vi.mock("@/components/trip/mobile-tab-bar", () => ({ MobileTabBar: () => null }));
vi.mock("@/components/trip/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/trip/fork-switcher", () => ({ ForkSwitcher: () => null }));
vi.mock("@/components/offline-warmer", () => ({ OfflineWarmer: () => null }));
vi.mock("@/components/feedback/feedback-trip-marker", () => ({
  FeedbackTripMarker: () => null,
}));
vi.mock("@/components/whats-new/whats-new-banner", () => ({
  WhatsNewBanner: (p: { className?: string }) => (
    <div data-testid="whats-new" className={p.className} />
  ),
}));
vi.mock("@/components/trip/reminders-card", () => ({
  RemindersCard: () => <div data-testid="reminders-card-marker" />,
}));
// Phase content isn't this task's concern (Task 10 restyles only page.tsx,
// trip-cover.tsx, reminders-card.tsx) — mocked away as markers so this test
// doesn't depend on which phase the fixture's dates land in. Each marker
// renders its `reminders` prop so Task 5's wiring (the page passes
// RemindersCard into whichever phase renders, instead of a full-width
// section of its own) is still checkable.
vi.mock("@/components/trip/home/phase-sketching", () => ({
  PhaseSketching: (props: { reminders?: React.ReactNode }) => (
    <div data-testid="phase-marker">{props.reminders}</div>
  ),
}));
vi.mock("@/components/trip/home/phase-planning", () => ({
  PhasePlanning: (props: { reminders?: React.ReactNode; cover?: React.ReactNode }) => (
    <div data-testid="phase-marker">
      <div data-testid="cover-slot">{props.cover}</div>
      {props.reminders}
    </div>
  ),
}));
vi.mock("@/components/trip/home/phase-travelling", () => ({
  // `data-user-id` pins Task 7's threading of the signed-in Traveller's id
  // through to PhaseTravelling (it loads Today's journal for them). Task 17:
  // the desktop (lg+) instance renders as its own marker, carrying the cover
  // it was handed.
  PhaseTravelling: (props: {
    reminders?: React.ReactNode;
    userId?: string;
    layout?: string;
    cover?: { url: string } | null;
  }) =>
    props.layout === "desktop" ? (
      <div data-testid="phase-desktop" data-user-id={props.userId} data-cover={props.cover?.url ?? ""}>
        {props.reminders}
      </div>
    ) : (
      <div data-testid="phase-marker" data-user-id={props.userId}>
        {props.reminders}
      </div>
    ),
}));
vi.mock("@/components/trip/home/phase-past", () => ({
  PhasePast: (props: { reminders?: React.ReactNode; layout?: string; cover?: { url: string } | null }) =>
    props.layout === "desktop" ? (
      <div data-testid="phase-desktop" data-cover={props.cover?.url ?? ""}>
        {props.reminders}
      </div>
    ) : (
      <div data-testid="phase-marker">{props.reminders}</div>
    ),
}));

// Task 16: the desktop tiles read the Home's one planning-data loader.
const loaderData = vi.hoisted(() => ({
  current: {
    datedStops: [],
    planStops: [] as unknown[],
    datedChapters: [],
    budget: { grandTotal: { costTotalMinor: 0, paidTotalMinor: 0 } },
    upcomingPayments: [] as unknown[],
    steps: [] as unknown[],
  },
}));
vi.mock("@/lib/desktop-home-loader", () => ({
  loadHomePlanningData: vi.fn(async () => loaderData.current),
}));
vi.mock("@/components/trip/home/desktop/route-map-tile", () => ({
  RouteMapTile: (p: { stops: { name: string }[] }) => (
    <div data-testid="route-map-tile">{p.stops.map((s) => s.name).join(",")}</div>
  ),
}));

const { default: TripLayout } = await import("./layout");
const { default: TripHomePage } = await import("./page");

const BASE_TRIP = {
  id: "trip-1",
  name: "Test Trip",
  startDate: "2026-01-01",
  endDate: "2026-01-10",
  homeCurrency: "GBP",
  drivingWindingFactor: 1.2,
  drivingAvgSpeedKph: 60,
  coverImageKey: null as string | null,
  homeName: null,
  homeLat: null,
  homeLng: null,
  homeCountryCode: null,
  roundTrip: false,
  chaptersEnabled: true,
  members: [],
  stops: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({
    user: { id: "owner-1", email: "owner@example.com" },
    membership: { userId: "owner-1", role: "owner" },
  });
  mockDb.trip.findUnique.mockResolvedValue(BASE_TRIP);
  mockDb.stop.findMany.mockResolvedValue([]);
  mockDb.transport.findFirst.mockResolvedValue(null);
  mockDb.attachment.findMany.mockResolvedValue([]);
  loaderData.current = {
    datedStops: [],
    planStops: [],
    datedChapters: [],
    budget: { grandTotal: { costTotalMinor: 0, paidTotalMinor: 0 } },
    upcomingPayments: [],
    steps: [],
  };
});

async function renderTripHome(tripId = "trip-1") {
  const params = Promise.resolve({ tripId });
  const pageEl = await TripHomePage({ params });
  const layoutEl = await TripLayout({ children: pageEl, params });
  render(layoutEl);
}

describe("Trip Home, composed with its layout", () => {
  it("renders the trip name as the page's single <h1> (owned by the layout)", async () => {
    await renderTripHome();
    // The desktop tree's own h1 is `hidden` below lg, the layout's is
    // lg:hidden on Home (R2) — exactly one of them outside the desktop tree.
    const desktop = screen.queryByTestId("desktop-home");
    const outside = screen
      .getAllByRole("heading", { level: 1, name: "Test Trip" })
      .filter((h) => !desktop?.contains(h));
    expect(outside).toHaveLength(1);
  });

  it("renders the trip's dates", async () => {
    await renderTripHome();
    expect(
      screen.getByText(formatDateRange(BASE_TRIP.startDate, BASE_TRIP.endDate)),
    ).toBeInTheDocument();
    expect(screen.queryByText("No dates yet")).not.toBeInTheDocument();
  });

  it("wraps the cover in the kit Card shape (2px border, hard shadow)", async () => {
    await renderTripHome();
    // No cover photo and no located stops on this fixture -> monogram cover.
    const monogram = screen.getByLabelText("Test Trip cover");
    const card = monogram.parentElement as HTMLElement;
    expect(card.className).toMatch(/\bborder-2\b/);
    expect(card.className).toMatch(/\bshadow-hard-\d\b/);
  });

  it("spaces the What's new banner below itself and never pulls the cover up over it", async () => {
    await renderTripHome();
    expect(screen.getByTestId("whats-new")).toHaveClass("mb-6");
    // No cover photo and no located stops on this fixture -> monogram cover.
    const monogram = screen.getByLabelText("Test Trip cover");
    const card = monogram.parentElement as HTMLElement;
    expect(card.className).not.toMatch(/-mt-/);
  });

  it("exposes the derived Phase as a hidden data-trip-phase marker (for the layout audit)", async () => {
    await renderTripHome();
    const marker = document.querySelector("[data-trip-phase]");
    expect(marker).not.toBeNull();
    expect(marker).toHaveAttribute("hidden");
    // BASE_TRIP is Jan 2026 and "today" is real time, so the phase is past — assert it's a known phase, not a specific one.
    expect(["sketching", "planning", "final-prep", "travelling", "past"]).toContain(marker!.getAttribute("data-trip-phase"));
  });

  // Task 7 (Today's journal, spec K): PhaseTravelling loads the signed-in
  // Traveller's own Journal entry separately from everyone else's, so it
  // needs their id — the page's own `requireTripAccess` call already has
  // it (previously discarded).
  it("passes the signed-in Traveller's id to PhaseTravelling", async () => {
    mockDb.trip.findUnique.mockResolvedValue({
      ...BASE_TRIP,
      // Comfortably spans "now" regardless of the real clock, so this
      // fixture always lands in the Travelling phase.
      startDate: "2020-01-01",
      endDate: "2035-01-01",
    });
    requireTripAccessMock.mockResolvedValue({
      user: { id: "traveller-42", email: "cam@example.com" },
      membership: { userId: "traveller-42", role: "owner" },
    });

    await renderTripHome();

    const marker = document.querySelector('[data-trip-phase="travelling"]');
    expect(marker).not.toBeNull();
    expect(screen.getByTestId("phase-marker")).toHaveAttribute("data-user-id", "traveller-42");
  });

  // LA-029/045: Reminders used to render as the page's own full-width section
  // below the phase content; now the page hands it to the phase component as
  // a prop, so the phase decides where it lands (its own right column/aside).
  it("passes Reminders into the phase component instead of rendering a section of its own", async () => {
    await renderTripHome();
    const phaseMarker = screen.getByTestId("phase-marker");
    expect(
      phaseMarker.querySelector('[data-testid="reminders-card-marker"]'),
    ).not.toBeNull();
  });

  // Spec E1/E2: on the Planning/Final-prep home the cover is a tile in the
  // phase's grid; every other phase keeps the full-width cover above it.
  describe("cover placement by Phase", () => {
    const FUTURE = { startDate: "2099-06-01", endDate: "2099-06-10" };

    it("hands the cover to the planning grid as a tile instead of a full-width band", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...FUTURE });
      await renderTripHome();
      const cover = screen.getByLabelText("Test Trip cover");
      expect(cover.closest('[data-testid="cover-slot"]')).not.toBeNull();
      expect(screen.getAllByLabelText("Test Trip cover")).toHaveLength(1);
      const card = cover.parentElement as HTMLElement;
      expect(card.className).toMatch(/\bborder-2\b/);
      expect(card.className).not.toContain("mb-2");
    });

    it("passes the Trip's focal point through to the cover tile photo", async () => {
      mockDb.trip.findUnique.mockResolvedValue({
        ...BASE_TRIP,
        ...FUTURE,
        coverImageKey: "trips/trip-1/k.webp",
        coverFocalX: 0.3,
        coverFocalY: 0.6,
      });
      await renderTripHome();
      const photo = screen.getByAltText("Test Trip cover") as HTMLImageElement;
      expect(photo.closest('[data-testid="cover-slot"]')).not.toBeNull();
      expect(photo.style.objectPosition).toBe("30% 60%");
    });

    it("keeps the full-width cover for a Past trip", async () => {
      await renderTripHome(); // BASE_TRIP is January 2026 → past
      const cover = screen.getByLabelText("Test Trip cover");
      expect(cover.closest('[data-testid="phase-marker"]')).toBeNull();
    });
  });

  // Task 15 (spec C): at lg+ the Sketching/Planning/Final-prep Home is the
  // desktop layout (header + 12-col grid); below lg the phone Phase tree is
  // unchanged. CSS switches between them, so both are in the DOM here.
  describe("desktop Home (lg+)", () => {
    const FUTURE = { startDate: "2099-06-01", endDate: "2099-06-10" };
    const ME = { id: "owner-1", name: "Cameron Williams", image: null, displayName: "Cam W", photoKey: null, photoUpdatedAt: null };

    it("renders the desktop tree inside hidden lg:flex and the phone tree inside lg:hidden", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...FUTURE });
      await renderTripHome();
      const desktop = screen.getByTestId("desktop-home");
      expect(desktop.className).toMatch(/(^|\s)hidden(\s|$)/);
      expect(desktop.className).toContain("lg:flex");
      const phone = screen.getByTestId("phase-marker").closest(".lg\\:hidden") as HTMLElement;
      expect(phone).not.toBeNull();
      expect(phone.contains(desktop)).toBe(false);
      expect(desktop.contains(screen.getByTestId("phase-marker"))).toBe(false);
    });

    it("has no quick actions, stat tiles, cover band or currency chips on desktop", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...FUTURE });
      await renderTripHome();
      const desktop = screen.getByTestId("desktop-home");
      expect(desktop.textContent).not.toMatch(/Add a cost/);
      expect(desktop.querySelector('[aria-label="Test Trip cover"]')).toBeNull();
    });

    it("greets the signed-in Traveller by their display name's first word and shows the header h1", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...FUTURE, members: [{ user: ME }] });
      await renderTripHome();
      const desktop = screen.getByTestId("desktop-home");
      expect(desktop.textContent).toContain("Hey Cam");
      expect(desktop.querySelector("h1")?.textContent).toBe("Test Trip");
      expect(desktop.textContent).toContain("1–10 Jun 2099 · 9 nights · GBP");
    });

    it("shows 'Pick your dates' for a date-less (Sketching) trip", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, startDate: null, endDate: null });
      await renderTripHome();
      expect(screen.getByTestId("desktop-home").textContent).toContain("Pick your dates");
    });

    it("puts the first transport leg on the countdown tile", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...FUTURE, homeName: "Sydney" });
      mockDb.transport.findFirst.mockResolvedValue({
        depAt: new Date("2099-06-01T09:00:00Z"),
        depPlace: null,
        arrPlace: null,
        depIsHome: true,
        fromStop: null,
        toStop: { name: "Denpasar, Bali" },
      });
      await renderTripHome();
      expect(screen.getByTestId("desktop-home").textContent).toContain("Mon 1 Jun · Sydney → Denpasar, Bali");
    });

    it("fills the grid with Shared pot, Route map and Sort these out — and no Reminders panel", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...FUTURE, homeCurrency: "AUD" });
      loaderData.current = {
        ...loaderData.current,
        planStops: [
          { id: "s1", name: "Paris", sortOrder: 0, lat: 48.8, lng: 2.3, countryCode: "fr", arriveDate: null, departDate: null, nights: 2 },
          { id: "s2", name: "Nowhere", sortOrder: 1, lat: null, lng: null, countryCode: null, arriveDate: null, departDate: null, nights: 1 },
        ],
        budget: { grandTotal: { costTotalMinor: 1_110_000, paidTotalMinor: 400_000 } },
        upcomingPayments: [{ costId: "c1", label: "Kuta pool villa", costMinor: 11_520, currency: "AUD", dueDate: "2099-05-20", daysUntil: 3 }],
        steps: [{ id: "nudge-packing", title: "Start your packing list", href: "/trips/trip-1/checklists", severity: "info", source: "nudge" }],
      };
      await renderTripHome();
      const desktop = screen.getByTestId("desktop-home");
      expect(desktop.textContent).toContain("$11.1k");
      expect(desktop.textContent).toContain("$115.20");
      expect(desktop.textContent).toContain("Kuta pool villa");
      expect(desktop.querySelector('[data-testid="route-map-tile"]')?.textContent).toBe("Paris");
      expect(desktop.querySelector("h2")).not.toBeNull();
      expect(desktop.textContent).toContain("Sort these out");
      expect(desktop.textContent).toContain("Start your packing list");
      expect(desktop.querySelector('[data-testid="reminders-card-marker"]')).toBeNull();
      // Phones keep the Reminders panel (no Sort these out tile there).
      const phone = screen.getByTestId("phase-marker");
      expect(phone.querySelector('[data-testid="reminders-card-marker"]')).not.toBeNull();
    });

    it("suggests adding a Stop in Sort these out when the trip has none", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, startDate: null, endDate: null });
      await renderTripHome();
      const desktop = screen.getByTestId("desktop-home");
      expect(desktop.textContent).toContain("Add your first stop");
    });

    // Task 17 (spec D): Travelling and Past get their own desktop layouts.
    const TRAVELLING = { startDate: "2020-01-01", endDate: "2035-01-01" };

    it("renders the Travelling desktop tree — header h1 plus the Phase's desktop grid — beside the phone tree", async () => {
      mockDb.trip.findUnique.mockResolvedValue({
        ...BASE_TRIP,
        ...TRAVELLING,
        coverImageKey: "covers/k1",
        members: [{ user: ME }],
      });
      await renderTripHome();
      expect(document.querySelector('[data-trip-phase="travelling"]')).not.toBeNull();
      const desktop = screen.getByTestId("desktop-home");
      expect(desktop.className).toContain("lg:flex");
      expect(desktop.querySelector("h1")?.textContent).toBe("Test Trip");
      expect(desktop.textContent).toContain("Hey Cam");
      const grid = screen.getByTestId("phase-desktop");
      expect(desktop.contains(grid)).toBe(true);
      expect(grid).toHaveAttribute("data-user-id", "owner-1");
      expect(grid.getAttribute("data-cover")).toBe("/api/trips/trip-1/cover?v=covers%2Fk1");
      // The phone Phase stays below lg, with its Reminders.
      const phone = screen.getByTestId("phase-marker");
      expect(phone.closest(".lg\\:hidden")).not.toBeNull();
      expect(phone.querySelector('[data-testid="reminders-card-marker"]')).not.toBeNull();
      expect(grid.querySelector('[data-testid="reminders-card-marker"]')).toBeNull();
    });

    it("renders the Past desktop tree with the header h1 and the Phase's desktop grid", async () => {
      await renderTripHome(); // BASE_TRIP → past
      expect(document.querySelector('[data-trip-phase="past"]')).not.toBeNull();
      const desktop = screen.getByTestId("desktop-home");
      expect(desktop.querySelector("h1")?.textContent).toBe("Test Trip");
      expect(desktop.contains(screen.getByTestId("phase-desktop"))).toBe(true);
      expect(screen.getByTestId("phase-desktop").getAttribute("data-cover")).toBe("");
      // The phone tree keeps its full-width cover band; the desktop tree has none.
      expect(desktop.querySelector('[aria-label="Test Trip cover"]')).toBeNull();
      expect(screen.getByTestId("phase-marker").closest(".lg\\:hidden")).not.toBeNull();
    });
  });
});
