import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/trip/share-chooser", () => ({ ShareTripButton: () => <button aria-label="Share" /> }));
vi.mock("@/components/trip/notification-bell", () => ({
  NotificationBell: (p: { unreadCount: number }) => (
    <button type="button" data-testid="bell" data-unread={p.unreadCount}>
      Notifications
    </button>
  ),
}));

vi.mock("@/components/shell/trip-switcher", () => ({
  TripSwitcherFromContext: (p: { tripId: string; variant?: string; fallbackName: string }) => (
    <div data-testid="trip-switcher" data-variant={p.variant} data-trip={p.tripId}>
      {p.fallbackName}
    </div>
  ),
}));

const { HomeHeader, homeMetaLine } = await import("@/components/trip/home/desktop/home-header");

describe("homeMetaLine", () => {
  it("joins dates and currency", () => {
    expect(
      homeMetaLine({ startDate: "2026-12-04", endDate: "2027-01-08", currency: "AUD" }),
    ).toBe("4 Dec 2026 – 8 Jan 2027 · AUD");
  });

  it("drops dates for a date-less trip", () => {
    expect(homeMetaLine({ startDate: null, endDate: null, currency: "EUR" })).toBe("EUR");
  });
});

const MEMBERS = [
  { id: "u1", name: "Cameron Williams", image: null },
  { id: "u2", name: "Sam Lee", image: null },
];

function renderHeader(overrides: Partial<Parameters<typeof HomeHeader>[0]> = {}) {
  render(
    <HomeHeader
      firstName="Cameron"
      tripName="Bali and Europe"
      metaLine="4 Dec 2026 – 8 Jan 2027 · AUD"
      unreadCount={4}
      recent={[]}
      members={MEMBERS}
      tripId="trip-1"
      tripSlug="trip-1"
      isOwner
      {...overrides}
    />,
  );
}

describe("HomeHeader", () => {
  it("greets by first name and owns the page h1", () => {
    renderHeader();
    expect(screen.getByText("Hey Cameron")).toBeInTheDocument();
    const h1 = screen.getByRole("heading", { level: 1, name: "Bali and Europe" });
    expect(h1.className).toContain("text-[40px]");
    expect(screen.getByText("4 Dec 2026 – 8 Jan 2027 · AUD")).toBeInTheDocument();
  });

  it("reuses the notification bell with the unread count", () => {
    renderHeader();
    expect(screen.getByTestId("bell")).toHaveAttribute("data-unread", "4");
  });

  it("stacks 40px avatars linking to the trip's travellers", () => {
    renderHeader();
    const people = screen.getByRole("link", { name: /Trip members \(2\)/ });
    expect(people).toHaveAttribute("href", "/trips/trip-1/settings#travellers");
    expect(people.querySelector(".-space-x-2\\.5")).not.toBeNull();
    expect(people.querySelectorAll(".size-10")).toHaveLength(2);
  });

  it("offers invites in the people label only to the Owner", () => {
    renderHeader({ isOwner: false });
    expect(screen.getByRole("link", { name: "Trip members (2)" })).toBeInTheDocument();
  });

  it("has a single primary '+ Add a stop' button into the Plan's add-Stop flow", () => {
    renderHeader();
    const add = screen.getByRole("link", { name: "+ Add a stop" });
    expect(add).toHaveAttribute("href", "/trips/trip-1/plan?add=stop");
    expect(screen.queryByText(/add a place/i)).toBeNull();
  });

  it("omits the meta line when there is none", () => {
    renderHeader({ metaLine: null });
    expect(screen.queryByText(/AUD/)).toBeNull();
  });
});

// Final review #4 (spec §A): the compact switcher pill must be reachable at
// 1024–1279px on Home, where the trip layout header is lg:hidden (R2).
describe("HomeHeader trip switcher pill", () => {
  it("renders the pill switcher for this trip, hidden from xl (the sidebar has it)", () => {
    renderHeader();
    const pill = screen.getByTestId("trip-switcher");
    expect(pill).toHaveAttribute("data-variant", "pill");
    expect(pill).toHaveAttribute("data-trip", "trip-1");
    const wrapper = pill.closest('[data-slot="home-trip-switcher"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.className).toMatch(/(^|\s)xl:hidden(\s|$)/);
  });
});
