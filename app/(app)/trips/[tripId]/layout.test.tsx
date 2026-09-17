import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// layout.tsx is an async server component. DB access, server actions and leaf
// components are mocked; leaf components are marker-mocked so we can assert
// presence/absence and props without depending on their internals.
//
// PushTimezoneSync (components/trip/enable-notifications.tsx) re-records a
// device's timezone when it has moved — the fix for a traveller who enables
// notifications in Brisbane and then flies to Europe, where every Digest
// would otherwise keep firing on Brisbane time. It is mounted here with
// `storedZone` read from the user's newest PushSubscription. The mount point
// itself was previously untested: deleting the mount, or wiring the wrong
// zone through, left the whole suite green.

const mockDb = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  attachment: { findMany: vi.fn() },
  pushSubscription: { findFirst: vi.fn() },
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
vi.mock("@/components/trip/enable-notifications", () => ({
  PushTimezoneSync: ({ storedZone }: { storedZone: string | null }) => (
    <div data-testid="push-timezone-sync" data-stored-zone={storedZone ?? ""} />
  ),
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
  mockDb.pushSubscription.findFirst.mockResolvedValue(null);
});

async function renderLayout() {
  const jsx = await TripLayout({
    children: <div>child content</div>,
    params: Promise.resolve({ tripId: "trip-1" }),
  });
  render(jsx);
}

describe("TripLayout PushTimezoneSync mount", () => {
  it("mounts PushTimezoneSync with the newest subscription's stored timezone", async () => {
    mockDb.pushSubscription.findFirst.mockResolvedValue({ timezone: "Australia/Brisbane" });

    await renderLayout();

    expect(mockDb.pushSubscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "owner-1" },
        orderBy: { createdAt: "desc" },
      }),
    );
    const el = screen.getByTestId("push-timezone-sync");
    expect(el).toBeInTheDocument();
    expect(el.getAttribute("data-stored-zone")).toBe("Australia/Brisbane");
  });

  it("passes null when the user has no stored subscription timezone", async () => {
    mockDb.pushSubscription.findFirst.mockResolvedValue(null);

    await renderLayout();

    const el = screen.getByTestId("push-timezone-sync");
    expect(el.getAttribute("data-stored-zone")).toBe("");
  });
});
