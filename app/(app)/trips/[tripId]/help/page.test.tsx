import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const requireTripAccess = vi.fn();
vi.mock("@/lib/guards", () => ({ requireTripAccess: (id: string) => requireTripAccess(id) }));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async (id: string) => id }));
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: vi.fn(async () => ({ name: "Christmas in Europe", members: [] })) }));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => <div data-testid="trip-header-trailing" /> }));
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

  it("renders its own h1 (PageHeader) with the trip name as eyebrow", async () => {
    const ui = await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    render(ui);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("How to use Teepee");
    expect(screen.getByText("Christmas in Europe")).toBeInTheDocument();
  });

  it("passes the tripId through so links deep-link into the trip", async () => {
    const ui = await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    render(ui);
    expect(screen.getByTestId("guide").getAttribute("data-trip-id")).toBe("t1");
  });

  it("drops the guide's outline one level so it nests under this page's h1", async () => {
    const ui = await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    render(ui);
    expect(screen.getByTestId("guide").getAttribute("data-level")).toBe("2");
  });

  it("styles its h1 as the kit display title", async () => {
    const ui = await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    const { container } = render(ui);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toMatch(/\bfont-extrabold\b/);
    expect(container.innerHTML).not.toContain("max-w-3xl");
  });
});
