import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BudgetGlance } from "./budget-glance";

describe("BudgetGlance", () => {
  it("shows the estimated budget when there is no actual spend", () => {
    render(<BudgetGlance estimatedMinor={120000} actualMinor={0} homeCurrency="AUD" href="/trips/t/budget" />);
    expect(screen.getByText("Estimated budget")).toBeInTheDocument();
  });

  it("shows spent-so-far when there is actual spend", () => {
    render(<BudgetGlance estimatedMinor={120000} actualMinor={50000} homeCurrency="AUD" href="/trips/t/budget" />);
    expect(screen.getByText("Spent so far")).toBeInTheDocument();
  });
});
