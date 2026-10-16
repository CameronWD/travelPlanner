import type { Route } from "next";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BudgetGlance } from "./budget-glance";

describe("BudgetGlance", () => {
  it("shows paid-so-far, cost, and links to the budget", () => {
    render(<BudgetGlance costTotalMinor={312000} paidTotalMinor={184000} homeCurrency="JPY" href={"/trips/t/budget" as Route} />);
    expect(screen.getByText(/paid so far/i)).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/trips/t/budget");
    expect(link.textContent).toContain("184k");
    expect(link.textContent).toMatch(/312k\s*cost/);
  });

  it("renders a zero-width bar when nothing is spent", () => {
    const { container } = render(<BudgetGlance costTotalMinor={312000} paidTotalMinor={0} homeCurrency="JPY" href={"/b" as Route} />);
    expect(container.querySelector('[style*="width: 0%"]')).toBeTruthy();
  });

  it("never frames money per person", () => {
    render(<BudgetGlance costTotalMinor={312000} paidTotalMinor={184000} homeCurrency="JPY" href={"/b" as Route} />);
    const link = screen.getByRole("link");
    const card = link.firstElementChild as HTMLElement;
    expect(card.className).toMatch(/\bbg-sun\b/);
    expect(card.className).toMatch(/\bborder-2\b/);
    expect(card.className).toMatch(/\bshadow-hard-\d\b/);
    expect(screen.getByRole("progressbar", { name: /paid so far/i })).toHaveAttribute("aria-valuenow", "59");
    expect(link.textContent).not.toMatch(/shared pot/i);
    expect(link.textContent).not.toMatch(/per person|each owes|split/i);
  });

  it("reads 99, not 100, while money is still owed (TB-09)", () => {
    render(<BudgetGlance costTotalMinor={100000} paidTotalMinor={99600} homeCurrency="AUD" href={"/b" as Route} />);
    expect(screen.getByRole("progressbar", { name: /paid so far/i })).toHaveAttribute("aria-valuenow", "99");
  });

  it("reads 100 only when fully paid (TB-09)", () => {
    render(<BudgetGlance costTotalMinor={100000} paidTotalMinor={100000} homeCurrency="AUD" href={"/b" as Route} />);
    expect(screen.getByRole("progressbar", { name: /paid so far/i })).toHaveAttribute("aria-valuenow", "100");
  });
});
