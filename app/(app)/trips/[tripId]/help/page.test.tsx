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
import { helpContents } from "@/lib/help-guide";

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

  it("runs the guide beside a sticky On this page rail from lg", async () => {
    const ui = await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    const { container } = render(ui);
    const rail = screen.getByRole("navigation", { name: "On this page" });
    expect(rail.className).toContain("lg:sticky");
    expect(rail.className).toContain("help-print-hide");
    const grid = rail.parentElement as HTMLElement;
    expect(grid.className).toContain("lg:grid-cols-[minmax(0,1fr)_14rem]");
    expect(container.querySelector("[data-testid='guide']")?.nextElementSibling).toBe(rail);
    const hrefs = Array.from(rail.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(helpContents().flatMap((g) => g.entries.map((e) => `#${e.id}`)));
  });
});
