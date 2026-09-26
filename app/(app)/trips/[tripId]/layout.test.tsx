import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
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
vi.mock("@/components/trip/trip-nav", () => ({ TripNav: () => null }));
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
    expect(screen.getByText("Test Trip")).toBeInTheDocument();
    expect(screen.queryByTestId("push-timezone-sync")).not.toBeInTheDocument();
  });

  it("marks the trip header block with data-trip-header (hook for the print route's hide list)", async () => {
    await renderLayout();
    const header = document.querySelector("[data-trip-header]");
    expect(header).toBeInTheDocument();
    expect(header).toContainElement(screen.getByText("Test Trip"));
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
