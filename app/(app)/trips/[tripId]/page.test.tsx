import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { formatDateRange } from "@/lib/dates";

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
  WhatsNewBanner: () => null,
}));
vi.mock("@/components/trip/reminders-card", () => ({
  RemindersCard: () => <div data-testid="reminders-card-marker" />,
}));
// Phase content isn't this task's concern (Task 10 restyles only page.tsx,
// trip-cover.tsx, reminders-card.tsx) — mocked away as markers so this test
// doesn't depend on which phase the fixture's dates land in.
vi.mock("@/components/trip/home/phase-sketching", () => ({
  PhaseSketching: () => <div data-testid="phase-marker" />,
}));
vi.mock("@/components/trip/home/phase-planning", () => ({
  PhasePlanning: () => <div data-testid="phase-marker" />,
}));
vi.mock("@/components/trip/home/phase-travelling", () => ({
  PhaseTravelling: () => <div data-testid="phase-marker" />,
}));
vi.mock("@/components/trip/home/phase-past", () => ({
  PhasePast: () => <div data-testid="phase-marker" />,
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
});
