import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpLegend, LEGEND_ENTRIES } from "./help-legend";

describe("HelpLegend", () => {
  it("renders a row for every documented control", () => {
    render(<HelpLegend />);
    for (const entry of LEGEND_ENTRIES) {
      expect(
        screen.getByText(entry.meaning),
        `missing legend row: ${entry.meaning}`,
      ).toBeTruthy();
    }
  });

  it("marks every specimen aria-hidden so the key is not read as controls", () => {
    // The icons are illustrations, not buttons the reader can press. Screen
    // readers should hear the description, never a stack of unlabelled buttons.
    const { container } = render(<HelpLegend />);
    const specimens = container.querySelectorAll("[data-testid='legend-specimen']");
    expect(specimens.length).toBe(LEGEND_ENTRIES.length);
    specimens.forEach((s) => {
      expect(s.getAttribute("aria-hidden")).toBe("true");
    });
  });

  it("documents the five mobile tab bar destinations", () => {
    render(<HelpLegend />);
    for (const label of ["Home", "Plan", "Calendar", "Budget", "More"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("shows a category pill and a chapter chip as live examples", () => {
    const { container } = render(<HelpLegend />);
    expect(screen.getByText("Food & Drink")).toBeTruthy();
    expect(container.querySelector("[data-testid='chapter-chip-dot']")).toBeTruthy();
  });
});
