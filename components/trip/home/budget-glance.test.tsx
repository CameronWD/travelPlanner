import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BudgetGlance } from "./budget-glance";

describe("BudgetGlance", () => {
  it("shows paid-so-far, cost, and links to the budget", () => {
    render(<BudgetGlance costTotalMinor={312000} paidTotalMinor={184000} homeCurrency="JPY" href="/trips/t/budget" />);
    expect(screen.getByText(/paid so far/i)).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/trips/t/budget");
    expect(link.textContent).toContain("184k");
    expect(link.textContent).toMatch(/312k\s*cost/);
  });

  it("renders a zero-width bar when nothing is spent", () => {
    const { container } = render(<BudgetGlance costTotalMinor={312000} paidTotalMinor={0} homeCurrency="JPY" href="/b" />);
    expect(container.querySelector('[style*="width: 0%"]')).toBeTruthy();
  });

  it("is the kit's sun 'Spent' StatCard: label, figure, progress bar, cost sub-line — shared pot, never per person", () => {
    render(<BudgetGlance costTotalMinor={312000} paidTotalMinor={184000} homeCurrency="JPY" href="/b" />);
    const link = screen.getByRole("link");
    const card = link.firstElementChild as HTMLElement;
    expect(card.className).toMatch(/\bbg-sun\b/);
    expect(card.className).toMatch(/\bborder-2\b/);
    expect(card.className).toMatch(/\bshadow-hard-\d\b/);
    expect(screen.getByRole("progressbar", { name: /paid so far/i })).toHaveAttribute("aria-valuenow", "59");
    expect(link.textContent).toMatch(/shared pot/);
    expect(link.textContent).not.toMatch(/per person|each owes|split/i);
  });
});
