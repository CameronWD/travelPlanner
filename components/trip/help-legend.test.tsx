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

  it("keeps every specimen out of the tab order", () => {
    // aria-hidden alone is not enough: an aria-hidden subtree containing a
    // focusable button is an aria-hidden-focus violation. The Button specimens
    // carry tabIndex={-1} for exactly this reason.
    const { container } = render(<HelpLegend />);
    const focusable = container.querySelectorAll(
      "[data-testid='legend-specimen'] button, [data-testid='legend-specimen'] a",
    );
    expect(focusable.length).toBeGreaterThan(0);
    focusable.forEach((el) => {
      expect(el.getAttribute("tabindex")).toBe("-1");
    });
  });

  it("pairs each specimen with its own meaning, not by position", () => {
    // The specimen used to be written out in the component and matched to
    // LEGEND_ENTRIES[n] by index, so swapping two meanings mis-captioned two
    // icons with a green suite. Rendering comes from the entries themselves now.
    const { container } = render(<HelpLegend />);
    const rows = Array.from(container.querySelectorAll("li")).filter((li) =>
      li.querySelector("[data-testid='legend-specimen']"),
    );
    expect(rows.length).toBe(LEGEND_ENTRIES.length);
    rows.forEach((row, i) => {
      expect(row.textContent).toContain(LEGEND_ENTRIES[i].meaning);
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
