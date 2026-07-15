import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BudgetHeroRow } from "./budget-hero-row";

describe("BudgetHeroRow", () => {
  const baseProps = {
    estimatedMinor: 312000,
    paidMinor: 184000,
    homeCurrency: "JPY",
    tripNights: 10,
  };

  it("renders the ESTIMATED TOTAL tile label and amount", () => {
    render(<BudgetHeroRow {...baseProps} />);
    expect(screen.getByText(/estimated total/i)).toBeInTheDocument();
    // ¥312,000 (JPY is zero-decimal)
    expect(screen.getAllByText(/312,000/).length).toBeGreaterThan(0);
  });

  it("renders the PAID tile with the paid amount", () => {
    render(<BudgetHeroRow {...baseProps} />);
    expect(screen.getByText(/^paid$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/184,000/).length).toBeGreaterThan(0);
  });

  it("renders the STILL TO PAY tile with estimated − paid", () => {
    render(<BudgetHeroRow {...baseProps} />);
    expect(screen.getByText(/still to pay/i)).toBeInTheDocument();
    // 312000 - 184000 = 128000
    expect(screen.getAllByText(/128,000/).length).toBeGreaterThan(0);
  });

  it("renders the EST / DAY tile with a per-day estimate", () => {
    render(<BudgetHeroRow {...baseProps} />);
    expect(screen.getByText(/est\s*\/\s*day/i)).toBeInTheDocument();
    // 312000 / 10 = 31200
    expect(screen.getAllByText(/31,200/).length).toBeGreaterThan(0);
  });

  it("shows — for EST / DAY when tripNights is zero (no-dates guard)", () => {
    render(<BudgetHeroRow {...baseProps} tripNights={0} />);
    expect(screen.getByText(/est\s*\/\s*day/i)).toBeInTheDocument();
    // Should show a dash/em-dash rather than a number
    expect(screen.getByTestId("est-per-day-value").textContent).toMatch(/^[—–-]$/);
  });

  it("shows — for EST / DAY when tripNights is undefined", () => {
    render(<BudgetHeroRow {...baseProps} tripNights={undefined} />);
    expect(screen.getByText(/est\s*\/\s*day/i)).toBeInTheDocument();
    expect(screen.getByTestId("est-per-day-value").textContent).toMatch(/^[—–-]$/);
  });

  it("renders amounts with tabular-nums class", () => {
    const { container } = render(<BudgetHeroRow {...baseProps} />);
    const tabularEls = container.querySelectorAll(".tabular-nums");
    expect(tabularEls.length).toBeGreaterThan(0);
  });

  it("renders the spent/estimated progress bar", () => {
    const { container } = render(<BudgetHeroRow {...baseProps} />);
    // Bar container should have bg-muted and inner bar bg-success
    expect(container.querySelector(".bg-success")).toBeInTheDocument();
    expect(container.querySelector(".bg-muted")).toBeInTheDocument();
  });
});
