import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/trip/help-guide", () => ({
  HelpGuide: ({ tripId, level }: { tripId?: string; level?: number }) => (
    <div data-testid="guide" data-trip-id={tripId ?? ""} data-level={level ?? ""} />
  ),
}));

import HelpPage, { metadata } from "./page";

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
});
