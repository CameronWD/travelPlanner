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
  attachment: { findMany: vi.fn() },
}));

const requireTripAccessMock = vi.hoisted(() =>
  vi.fn(async () => ({
    user: { id: "owner-1", email: "owner@example.com" },
    membership: { userId: "owner-1", role: "owner" },
  })),
);

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
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
  PhaseTravelling: (props: { reminders?: React.ReactNode }) => (
    <div data-testid="phase-marker">{props.reminders}</div>
  ),
}));
vi.mock("@/components/trip/home/phase-past", () => ({
  PhasePast: (props: { reminders?: React.ReactNode }) => (
    <div data-testid="phase-marker">{props.reminders}</div>
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
  mockDb.attachment.findMany.mockResolvedValue([]);
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
    expect(
      screen.getByRole("heading", { level: 1, name: "Test Trip" }),
    ).toBeInTheDocument();
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
});
