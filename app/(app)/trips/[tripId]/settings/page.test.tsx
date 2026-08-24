import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// settings/page.tsx is an async server component. All DB access and the
// share/calendar-feed server actions are mocked; leaf panels are marker-mocked
// so we can assert presence/absence without depending on their internals.
//
// Task 13 sweep: this page fetched and rendered the "Chapters" management
// card unconditionally, ignoring Trip.chaptersEnabled — the one surface not
// already named in the Task 13 brief. Gated here the same way as the other
// chapter surfaces: skip the query, hide the card, when the trip has chapters
// turned off.

const mockDb = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  chapter: { findMany: vi.fn() },
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(async () => ({ membership: { role: "owner" } })),
}));
vi.mock("@/server/actions/share", () => ({ getShareLink: vi.fn(async () => null) }));
vi.mock("@/server/actions/calendar-feed", () => ({ getCalendarFeed: vi.fn(async () => null) }));
vi.mock("@/components/trip/settings/trip-details-form", () => ({ TripDetailsForm: () => null }));
vi.mock("@/components/trip/settings/cover-image-field", () => ({ CoverImageField: () => null }));
vi.mock("@/components/trip/settings/invite-panel", () => ({ InvitePanel: () => null }));
vi.mock("@/components/trip/settings/share-panel", () => ({ SharePanel: () => null }));
vi.mock("@/components/trip/settings/calendar-feed-panel", () => ({ CalendarFeedPanel: () => null }));
vi.mock("@/components/trip/settings/driving-estimates-panel", () => ({ DrivingEstimatesPanel: () => null }));
vi.mock("@/components/trip/settings/danger-zone", () => ({ DangerZone: () => null }));
vi.mock("@/components/trip/duplicate-trip-dialog", () => ({ DuplicateTripDialog: () => null }));
vi.mock("@/components/trip/chapters-manager", () => ({
  ChaptersManager: () => <div data-testid="chapters-manager" />,
}));

const { default: SettingsPage } = await import("./page");

const BASE_TRIP = {
  id: "trip-1",
  name: "Test Trip",
  startDate: "2026-01-01",
  endDate: "2026-01-10",
  hardEndDate: null,
  coverImageKey: null,
  homeCurrency: "GBP",
  homeName: null,
  roundTrip: false,
  drivingWindingFactor: 1.3,
  drivingAvgSpeedKph: 80,
  members: [],
  invites: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.chapter.findMany.mockResolvedValue([
    { id: "c1", name: "Italy Leg", colour: "sky", startDate: "2026-01-01", endDate: "2026-01-10" },
  ]);
});

async function renderSettings() {
  const jsx = await SettingsPage({ params: Promise.resolve({ tripId: "trip-1" }) });
  render(jsx);
}

describe("SettingsPage chapter gating (Task 13)", () => {
  it("hides the Chapters card and skips the chapters query when chaptersEnabled is false", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: false });

    await renderSettings();

    expect(mockDb.chapter.findMany).not.toHaveBeenCalled();
    expect(screen.queryByText("Chapters")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chapters-manager")).not.toBeInTheDocument();
  });

  it("shows the Chapters card and runs the chapters query when chaptersEnabled is true", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: true });

    await renderSettings();

    expect(mockDb.chapter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1", forkId: null } }),
    );
    expect(screen.getByText("Chapters")).toBeInTheDocument();
    expect(screen.getByTestId("chapters-manager")).toBeInTheDocument();
  });
});
