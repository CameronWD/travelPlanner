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
vi.mock("@/components/trip/fork-switcher", () => ({ ForkSwitcher: () => null }));
vi.mock("@/components/offline-warmer", () => ({ OfflineWarmer: () => null }));
vi.mock("@/components/feedback/feedback-trip-marker", () => ({
  FeedbackTripMarker: () => null,
}));

const { default: TripLayout } = await import("./layout");

const BASE_TRIP = {
  id: "trip-1",
  name: "Test Trip",
  startDate: "2026-01-01",
  endDate: "2026-01-10",
  homeCurrency: "GBP",
  members: [],
  stops: [],
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
});
