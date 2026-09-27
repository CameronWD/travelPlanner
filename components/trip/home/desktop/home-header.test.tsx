import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/trip/notification-bell", () => ({
  NotificationBell: (p: { unreadCount: number }) => (
    <button type="button" data-testid="bell" data-unread={p.unreadCount}>
      Notifications
    </button>
  ),
}));

const { HomeHeader, homeMetaLine } = await import("@/components/trip/home/desktop/home-header");

describe("homeMetaLine", () => {
  it("joins dates, nights, stops and currency", () => {
    expect(
      homeMetaLine({ startDate: "2026-12-04", endDate: "2027-01-08", stopCount: 11, currency: "AUD" }),
    ).toBe("4 Dec 2026 – 8 Jan 2027 · 35 nights · 11 stops · AUD");
  });

  it("uses singulars", () => {
    expect(
      homeMetaLine({ startDate: "2026-12-04", endDate: "2026-12-05", stopCount: 1, currency: "AUD" }),
    ).toBe("4–5 Dec 2026 · 1 night · 1 stop · AUD");
  });

  it("drops dates and nights for a date-less trip, and a zero stop count", () => {
    expect(homeMetaLine({ startDate: null, endDate: null, stopCount: 0, currency: "EUR" })).toBe("EUR");
    expect(homeMetaLine({ startDate: null, endDate: null, stopCount: 3, currency: "EUR" })).toBe("3 stops · EUR");
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
      metaLine="4 Dec 2026 – 8 Jan 2027 · 35 nights · 11 stops · AUD"
      unreadCount={4}
      recent={[]}
      members={MEMBERS}
      tripId="trip-1"
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
    expect(screen.getByText("4 Dec 2026 – 8 Jan 2027 · 35 nights · 11 stops · AUD")).toBeInTheDocument();
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
