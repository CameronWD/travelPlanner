import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const requireTripAccess = vi.fn();
vi.mock("@/lib/guards", () => ({ requireTripAccess: (id: string) => requireTripAccess(id) }));
vi.mock("@/components/trip/help-guide", () => ({
  HelpGuide: ({ tripId }: { tripId?: string }) => (
    <div data-testid="guide" data-trip-id={tripId ?? ""} />
  ),
}));

import TripHelpPage from "./page";

beforeEach(() => {
  requireTripAccess.mockReset();
});

describe("trip-scoped help page", () => {
  it("guards access before rendering", async () => {
    await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    expect(requireTripAccess).toHaveBeenCalledWith("t1");
  });

  it("tops out at <h2>, because the trip layout owns the page <h1>", async () => {
    // app/(app)/trips/[tripId]/layout.tsx renders the trip name as the <h1>
    // above {children}. A second <h1> here would give the route two.
    const ui = await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    render(ui);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "How to use TEEPEE",
    );
  });

  it("passes the tripId through so links deep-link into the trip", async () => {
    const ui = await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    render(ui);
    expect(screen.getByTestId("guide").getAttribute("data-trip-id")).toBe("t1");
  });
});
