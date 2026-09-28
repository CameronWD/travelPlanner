import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips/t1");
vi.mock("next/navigation", () => ({ usePathname: () => mockUsePathname() }));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import TripsError from "./error";

// The sidebar's inline search imports the Search server actions, whose module
// opens the database at import time — stub them (no Postgres in unit tests).
vi.mock("@/server/actions/search", () => ({
  searchTrip: vi.fn(async () => []),
  listMyTrips: vi.fn(async () => []),
}));

beforeEach(() => {
  mockUsePathname.mockReturnValue("/trips/t1");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response())));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the trips error screen", () => {
  // It also catches a failure in the trip layout itself (the layout above a
  // segment's own error.tsx is outside that boundary), where TripNav never
  // mounted and AppRail bows out on a trip path.
  it("keeps the rail on a trip path", () => {
    render(<TripsError error={new Error("boom")} reset={() => {}} />);
    expect(screen.getByRole("navigation", { name: "Teepee" })).toBeInTheDocument();
  });

  it("adds no second rail on /trips, where the layout's AppRail already shows", () => {
    mockUsePathname.mockReturnValue("/trips");
    render(<TripsError error={new Error("boom")} reset={() => {}} />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
