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
  tripMember: { findMany: vi.fn().mockResolvedValue([]) },
}));

const requireTripAccessMock = vi.hoisted(() =>
  vi.fn(async () => ({
    user: { id: "owner-1", email: "owner@example.com" },
    membership: { userId: "owner-1", role: "owner" },
  })),
);

// Records every CoverArt call so tests can assert what the Home page threads
// through as props, even though the rendered mock itself is an opaque stub.
const coverArtMock = vi.hoisted(() => vi.fn());

// TripHeaderFrame reads the pathname (Home hides the layout header at lg+).
// SectionTransition (ADR 0063) reads useSelectedLayoutSegment from the layout.
vi.mock("next/navigation", () => ({ notFound: vi.fn(), usePathname: () => "/trips/trip-1", useSelectedLayoutSegment: () => null }));
vi.mock("@/lib/reconcile-invites", () => ({ reconcilePendingInvites: vi.fn(async () => {}) }));
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
vi.mock("@/components/trips/trip-cover", () => ({
  CoverArt: (props: Record<string, unknown>) => {
    coverArtMock(props);
    return <div data-testid="cover-art" />;
  },
}));
vi.mock("@/components/trip/trip-cover-card", () => ({
  TripCoverCard: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="cover-card" className={className}>{children}</div>
  ),
}));
// The portrait frame's photo (next/image underneath) — an inspectable stub.
vi.mock("@/components/trips/cover-photo-image", () => ({
  CoverPhotoImage: (p: { url: string; alt: string; fit?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-testid="cover-photo" src={p.url} alt={p.alt} data-fit={p.fit ?? "cover"} />
  ),
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
  PhasePlanning: (props: { reminders?: React.ReactNode; cover?: React.ReactNode; coverClassName?: string }) => (
    <div data-testid="phase-marker">
      <div data-testid="cover-slot" data-cover-class={props.coverClassName ?? ""}>{props.cover}</div>
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
    datedChapters: [] as unknown[],
    undatedChapterCount: 0,
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
  coverAspect: null as number | null,
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
  mockDb.tripMember.findMany.mockResolvedValue([]);
  loaderData.current = {
    datedStops: [],
    planStops: [],
    datedChapters: [],
    undatedChapterCount: 0,
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

  // Task 10: the cover's own kit-Card shape (2px border, hard shadow) is now
  // pinned by trip-cover-card.test.tsx directly — TripCoverCard is mocked
  // away here, so this only checks the Home wires a cover into the phone tree.
  it("renders the cover band in the phone tree", async () => {
    await renderTripHome();
    expect(screen.getByTestId("cover-art")).toBeInTheDocument();
  });

  it("spaces the What's new banner below itself", async () => {
    await renderTripHome();
    expect(screen.getByTestId("whats-new")).toHaveClass("mb-6");
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
      const covers = screen.getAllByTestId("cover-art");
      expect(covers).toHaveLength(1);
      expect(covers[0].closest('[data-testid="cover-slot"]')).not.toBeNull();
    });

    it("passes the Trip's photo, focal point and edit-lock through to CoverArt", async () => {
      mockDb.trip.findUnique.mockResolvedValue({
        ...BASE_TRIP,
        ...FUTURE,
        coverImageKey: "k1",
        coverFocalX: 0.3,
        coverFocalY: 0.7,
      });
      await renderTripHome();
      expect(coverArtMock).toHaveBeenCalledTimes(1);
      const props = coverArtMock.mock.calls[0][0];
      expect(props.photo).toEqual({
        url: "/api/trips/trip-1/cover?v=k1",
        focalX: 0.3,
        focalY: 0.7,
        version: "k1",
      });
      expect(props.canEdit).toBe(false);
      expect(props.box).toBe("band");
    });

    it("keeps the full-width cover for a Past trip", async () => {
      await renderTripHome(); // BASE_TRIP is January 2026 → past
      const cover = screen.getByTestId("cover-art");
      expect(cover.closest('[data-testid="phase-marker"]')).toBeNull();
    });
  });

  // Spec 2026-10-05 §I: below sm, a portrait photo shows whole in a small
  // frame beside the trip name (the layout's h1) instead of the band.
  describe("portrait cover on a phone", () => {
    const FUTURE = { startDate: "2099-06-01", endDate: "2099-06-10" };
    const PORTRAIT = { coverImageKey: "k1", coverAspect: 0.75 };

    it("puts a portrait frame beside the trip name and hides the band below sm (Past)", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...PORTRAIT });
      await renderTripHome();
      const frame = screen.getByTestId("portrait-cover");
      const h1 = document.querySelector("[data-trip-header] h1")!;
      expect(h1).toHaveTextContent("Test Trip");
      expect(frame.parentElement).toContainElement(h1 as HTMLElement);
      expect(frame.querySelector("img")).toHaveAttribute("src", "/api/trips/trip-1/cover?v=k1");
      expect(frame.querySelector("img")).toHaveAttribute("data-fit", "contain");
      // Two TripCoverCard mocks exist now: the band and the frame's own
      // (smaller) card — both share the mocked "cover-card" testid, so scope
      // to the one outside the frame rather than getByTestId (ambiguous).
      const bandCard = screen.getAllByTestId("cover-card").find((el) => !frame.contains(el))!;
      expect(bandCard.className.split(/\s+/)).toContain("max-sm:hidden");
    });

    it("hides the Planning grid's cover cell below sm instead", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...FUTURE, ...PORTRAIT });
      await renderTripHome();
      expect(screen.getByTestId("portrait-cover")).toBeInTheDocument();
      expect(screen.getByTestId("cover-slot")).toHaveAttribute("data-cover-class", "max-sm:hidden");
    });

    it.each([
      ["a landscape photo", { coverImageKey: "k1", coverAspect: 1.5 }],
      ["a square photo", { coverImageKey: "k1", coverAspect: 1 }],
      ["a photo whose aspect is unknown", { coverImageKey: "k1", coverAspect: null }],
      ["no photo (generated art)", { coverImageKey: null, coverAspect: 0.75 }],
    ])("keeps the band and shows no frame for %s", async (_label, cover) => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...cover });
      await renderTripHome();
      expect(screen.queryByTestId("portrait-cover")).toBeNull();
      expect(screen.getByTestId("cover-card").className.split(/\s+/)).not.toContain("max-sm:hidden");
    });

    it("keeps the Planning cover cell visible for a landscape photo", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...FUTURE, coverImageKey: "k1", coverAspect: 1.5 });
      await renderTripHome();
      expect(screen.getByTestId("cover-slot")).toHaveAttribute("data-cover-class", "");
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
      expect(desktop.querySelector('[data-testid="cover-art"]')).toBeNull();
    });

    it("greets the signed-in Traveller by their display name's first word and shows the header h1", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...FUTURE, members: [{ user: ME }] });
      await renderTripHome();
      const desktop = screen.getByTestId("desktop-home");
      expect(desktop.textContent).toContain("Hey Cam");
      expect(desktop.querySelector("h1")?.textContent).toBe("Test Trip");
      expect(desktop.textContent).toContain("1–10 Jun 2099 · GBP");
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

    it("counts rough Chapters too in the countdown tile's Chapters stat", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...FUTURE });
      loaderData.current = {
        ...loaderData.current,
        datedChapters: [{ id: "c1", name: "Bali", colour: "coral", startDate: "2099-06-01", endDate: "2099-06-05" }],
        undatedChapterCount: 2,
      };
      await renderTripHome();
      const row = screen.getByTestId("desktop-home").querySelector('[aria-label="Trip at a glance"]');
      expect([...row!.querySelectorAll("li")].map((li) => li.textContent)).toContain("3Chapters");
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
      expect(desktop.querySelector('[data-testid="cover-art"]')).toBeNull();
      expect(screen.getByTestId("phase-marker").closest(".lg\\:hidden")).not.toBeNull();
    });
  });
});

describe("Trip Home reads (spec 2026-10-06 §C)", () => {
  it("reads the Trip, its cover Stops and the viewer's Trips in one wave", async () => {
    let release!: (v: unknown) => void;
    mockDb.trip.findUnique.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const pending = TripHomePage({ params: Promise.resolve({ tripId: "trip-1" }) });
    await vi.waitFor(() => {
      expect(mockDb.stop.findMany).toHaveBeenCalled();
      expect(mockDb.tripMember.findMany).toHaveBeenCalled();
    });
    release(BASE_TRIP);
    await pending;
  });
});
