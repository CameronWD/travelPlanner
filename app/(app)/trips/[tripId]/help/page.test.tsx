import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const requireTripAccess = vi.fn();
vi.mock("@/lib/guards", () => ({ requireTripAccess: (id: string) => requireTripAccess(id) }));
vi.mock("@/components/trip/help-guide", () => ({
  HelpGuide: ({ tripId, level }: { tripId?: string; level?: number }) => (
    <div data-testid="guide" data-trip-id={tripId ?? ""} data-level={level ?? ""} />
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
      "How to use Teepee",
    );
  });

  it("passes the tripId through so links deep-link into the trip", async () => {
    const ui = await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    render(ui);
    expect(screen.getByTestId("guide").getAttribute("data-trip-id")).toBe("t1");
  });

  it("drops the guide's outline one level so it nests under this page's h2", async () => {
    const ui = await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    render(ui);
    expect(screen.getByTestId("guide").getAttribute("data-level")).toBe("3");
  });

  it("styles its h2 as the kit display title", async () => {
    const ui = await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    const { container } = render(ui);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.className).toMatch(/\bfont-extrabold\b/);
    expect(container.innerHTML).not.toContain("max-w-3xl");
  });
});
