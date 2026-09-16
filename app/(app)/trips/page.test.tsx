import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { requireUserMock, tripMemberFindManyMock, stopFindManyMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  tripMemberFindManyMock: vi.fn(),
  stopFindManyMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/db", () => ({
  db: {
    tripMember: { findMany: tripMemberFindManyMock },
    // The page unconditionally queries cover-fallback stops before checking
    // whether there are any trips at all, so this needs stubbing too even for
    // the empty-state case.
    stop: { findMany: stopFindManyMock },
  },
}));

// next/link renders a plain <a> in jsdom
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children?: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Client/heavy children the empty state never renders — stub to keep the
// jsdom render cheap and free of client-only hooks.
vi.mock("@/components/trip/trip-card", () => ({ TripCard: () => null }));
vi.mock("@/components/ui/animated-list", () => ({
  AnimatedList: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  AnimatedItem: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import TripsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "u1", name: "Sis", email: "sis@example.com" });
  tripMemberFindManyMock.mockResolvedValue([]);
  stopFindManyMock.mockResolvedValue([]);
});

describe("TripsPage empty state", () => {
  it("offers the help guide alongside creating the first trip", async () => {
    render(await TripsPage());

    expect(screen.getByText("No trips yet")).toBeInTheDocument();

    const helpLink = screen.getByRole("link", { name: /how to use teepee/i });
    expect(helpLink).toHaveAttribute("href", "/help");

    // "New trip" stays the primary action (header + empty state).
    const newTripLinks = screen.getAllByRole("link", { name: /new trip/i });
    expect(newTripLinks.some((a) => a.getAttribute("href") === "/trips/new")).toBe(true);
  });
});
