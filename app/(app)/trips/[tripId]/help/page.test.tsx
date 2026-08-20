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

  it("passes the tripId through so links deep-link into the trip", async () => {
    const ui = await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    render(ui);
    expect(screen.getByTestId("guide").getAttribute("data-trip-id")).toBe("t1");
  });
});
