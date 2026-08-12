import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CostAmounts } from "./cost-amounts";

describe("CostAmounts", () => {
  it("shows the cost amount with an accessible label", () => {
    render(<CostAmounts costTotalMinor={12300} paidTotalMinor={0} currency="AUD" />);
    expect(screen.getByText("$123.00")).toBeInTheDocument();
    expect(screen.getByLabelText(/cost/i)).toBeInTheDocument();
  });

  it("renders a '—' placeholder in the paid column when paid is 0 (columns stay aligned)", () => {
    render(<CostAmounts costTotalMinor={12300} paidTotalMinor={0} currency="AUD" />);
    const paid = screen.getByLabelText(/paid/i);
    expect(paid).toBeInTheDocument();
    expect(paid).toHaveTextContent("—");
  });

  it("shows the paid amount in the paid style when > 0", () => {
    render(<CostAmounts costTotalMinor={12300} paidTotalMinor={9900} currency="AUD" />);
    const paid = screen.getByLabelText(/paid/i);
    expect(paid).toHaveTextContent("$99.00");
    expect(paid.className).toContain("text-emerald-600");
  });

  it("does not show the paid amount text when paid is 0 (just a placeholder)", () => {
    render(<CostAmounts costTotalMinor={12300} paidTotalMinor={0} currency="AUD" />);
    const paid = screen.getByLabelText(/paid/i);
    // Placeholder, not a real money string
    expect(paid).toHaveTextContent("—");
    expect(paid).not.toHaveTextContent("$");
  });

  it("does not shrink, so the adjacent label truncates instead of overflowing", () => {
    const { container } = render(<CostAmounts costTotalMinor={1000} paidTotalMinor={0} currency="AUD" />);
    expect(container.firstElementChild?.className).toContain("shrink-0");
  });

  it("cost span uses whitespace-nowrap (flexible width for all decimal counts)", () => {
    render(<CostAmounts costTotalMinor={1000} paidTotalMinor={0} currency="AUD" />);
    const cost = screen.getByLabelText(/cost/i);
    // Flexible layout: no hardcoded min-w that assumes 2 decimals
    expect(cost.className).toContain("whitespace-nowrap");
    expect(cost.className).not.toContain("min-w-[4rem]");
  });
});
