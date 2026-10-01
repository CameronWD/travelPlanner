import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/trip/help-guide", () => ({
  HelpGuide: ({ tripId, level }: { tripId?: string; level?: number }) => (
    <div data-testid="guide" data-trip-id={tripId ?? ""} data-level={level ?? ""} />
  ),
}));

import HelpPage, { metadata } from "./page";
import { HELP_GROUP_LABELS, HELP_LEGEND_ID, helpContents } from "@/lib/help-guide";

describe("global /help page", () => {
  it("has a title", () => {
    expect(metadata.title).toBeTruthy();
  });

  it("renders the guide with no tripId, so links degrade to text", () => {
    render(<HelpPage />);
    expect(screen.getByTestId("guide").getAttribute("data-trip-id")).toBe("");
  });

  it("renders a page heading", () => {
    render(<HelpPage />);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("titles the page with the kit display h1 at the layout's full width", () => {
    const { container } = render(<HelpPage />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("How to use Teepee");
    expect(h1.className).toMatch(/\bfont-extrabold\b/);
    expect(h1.className).toMatch(/\blg:text-4xl\b/);
    // The kit's three-up topic grid needs the main column, not a 3xl strip.
    expect(container.innerHTML).not.toContain("max-w-3xl");
  });

  it("leaves the guide's outline at its default (h2 groups under this h1)", () => {
    render(<HelpPage />);
    expect(screen.getByTestId("guide").getAttribute("data-level")).toBe("");
  });

  it("runs the guide beside a sticky On this page rail from lg", () => {
    const { container } = render(<HelpPage />);
    const rail = screen.getByRole("navigation", { name: "On this page" });
    expect(rail.className).toContain("lg:sticky");
    expect(rail.className).toContain("lg:top-6");
    expect(rail.className).toContain("lg:max-h-[calc(100dvh-3rem)]");
    expect(rail.className).toContain("help-print-hide");
    const grid = rail.parentElement as HTMLElement;
    expect(grid.className).toContain("lg:grid");
    expect(grid.className).toContain("lg:grid-cols-[minmax(0,1fr)_14rem]");
    expect(grid.querySelector("[data-testid='guide']")).toBeTruthy();
    expect(container.querySelector("[data-testid='guide']")?.nextElementSibling).toBe(rail);
  });

  it("the rail lists the walkthrough, the legend, then every card under its group", () => {
    render(<HelpPage />);
    const rail = screen.getByRole("navigation", { name: "On this page" });
    const hrefs = Array.from(rail.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(helpContents().flatMap((g) => g.entries.map((e) => `#${e.id}`)));
    expect(hrefs.slice(0, 2)).toEqual(["#the-life-of-one-trip", `#${HELP_LEGEND_ID}`]);
    for (const label of Object.values(HELP_GROUP_LABELS)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
