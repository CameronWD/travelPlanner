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

const requireTripAccessMock = vi.hoisted(() =>
  vi.fn(async () => ({
    user: { id: "owner-1", email: "owner@example.com" },
    membership: { userId: "owner-1", role: "owner" },
  })),
);

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
}));
vi.mock("@/server/actions/share", () => ({ listShareLinks: vi.fn(async () => []) }));
vi.mock("@/server/actions/calendar-feed", () => ({ getCalendarFeed: vi.fn(async () => null) }));
vi.mock("@/server/actions/digest", () => ({
  getDigestSettings: vi.fn(async () => ({ enabled: true, deviceCount: 0 })),
}));
vi.mock("@/components/trip/settings/trip-details-form", () => ({ TripDetailsForm: () => null }));
vi.mock("@/components/trip/settings/cover-image-field", () => ({ CoverImageField: () => null }));
vi.mock("@/components/trip/settings/invite-panel", () => ({ InvitePanel: () => null }));
vi.mock("@/components/trip/settings/share-links-panel", () => ({ ShareLinksPanel: () => null }));
vi.mock("@/components/trip/settings/calendar-feed-panel", () => ({ CalendarFeedPanel: () => null }));
vi.mock("@/components/trip/settings/digest-panel", () => ({
  DigestPanel: () => <div data-testid="digest-panel" />,
}));
vi.mock("@/components/trip/settings/driving-estimates-panel", () => ({ DrivingEstimatesPanel: () => null }));
vi.mock("@/components/trip/settings/danger-zone", () => ({ DangerZone: () => null }));
vi.mock("@/components/trip/duplicate-trip-dialog", () => ({ DuplicateTripDialog: () => null }));
vi.mock("@/components/trip/chapters-manager", () => ({
  ChaptersManager: () => <div data-testid="chapters-manager" />,
}));

const { getDigestSettings } = await import("@/server/actions/digest");
const { default: SettingsPage, SETTINGS_GRID_CLASS } = await import("./page");

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

describe("SettingsPage Digest card", () => {
  it("mounts the Digest panel with this traveller's settings", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: false });

    await renderSettings();

    expect(getDigestSettings).toHaveBeenCalledWith("trip-1");
    expect(screen.getByTestId("digest-panel")).toBeInTheDocument();
    expect(screen.getByText("Digest")).toBeInTheDocument();
  });

  it("places Digest immediately above the Calendar feed card", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: false });

    await renderSettings();

    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(titles.indexOf("Calendar feed")).toBe(titles.indexOf("Digest") + 1);
  });
});

describe("Settings companion-column layout (LA-046)", () => {
  it("settings cards sit in two columns from lg", () => {
    expect(SETTINGS_GRID_CLASS).toContain("lg:grid-cols-2");
    expect(SETTINGS_GRID_CLASS).not.toContain("max-w-2xl");
  });

  it("card body copy is capped to a reading measure (LA-051)", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: false });

    await renderSettings();

    const calendarCopy = screen.getByText(/Subscribe to this trip/);
    expect(calendarCopy.className).toContain("max-w-reading");
    const drivingCopy = screen.getByText(/Tune the offline estimates/);
    expect(drivingCopy.className).toContain("max-w-reading");
  });
});

describe("SettingsPage Danger zone admin gate (ADR 0045)", () => {
  it("shows the Danger zone to an admin who is only a member", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u1", email: "admin@example.com" },
      membership: { userId: "u1", role: "member" },
    });
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: false });

    await renderSettings();

    expect(screen.getByText("Danger zone")).toBeInTheDocument();
    delete process.env.ADMIN_EMAILS;
  });

  it("hides the Danger zone from an ordinary member", async () => {
    delete process.env.ADMIN_EMAILS;
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u2", email: "someone@example.com" },
      membership: { userId: "u2", role: "member" },
    });
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: false });

    await renderSettings();

    expect(screen.queryByText("Danger zone")).not.toBeInTheDocument();
  });
});
