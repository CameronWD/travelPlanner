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
});
