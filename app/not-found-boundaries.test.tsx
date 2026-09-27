import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import RootNotFound from "@/app/not-found";
import AppNotFound from "@/app/(app)/not-found";
import TripNotFound from "@/app/(app)/trips/[tripId]/not-found";
import ShareNotFound from "@/app/share/[token]/not-found";

// The sidebar's inline search imports the Search server actions, whose module
// opens the database at import time — stub them (no Postgres in unit tests).
vi.mock("@/server/actions/search", () => ({
  searchTrip: vi.fn(async () => []),
  listMyTrips: vi.fn(async () => []),
}));

describe("not-found boundaries", () => {
  it.each([
    ["root", RootNotFound],
    ["app", AppNotFound],
    ["trip", TripNotFound],
    ["share", ShareNotFound],
  ])("%s renders an ErrorPanel with no emoji art", (_n, C) => {
    const { container } = render(<C />);
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });

  it("root/app/trip not-found never reveals that a trip exists", () => {
    for (const C of [RootNotFound, AppNotFound, TripNotFound]) {
      const { container, unmount } = render(<C />);
      expect(container.textContent).toMatch(/doesn.t exist, or you don.t have access/);
      unmount();
    }
  });

  it("app not-found links back to trips", () => {
    render(<AppNotFound />);
    expect(screen.getByRole("link", { name: /back to trips/i })).toHaveAttribute("href", "/trips");
  });

  it("root not-found links back to trips", () => {
    render(<RootNotFound />);
    expect(screen.getByRole("link", { name: /back to trips/i })).toHaveAttribute("href", "/trips");
  });
});
