import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CostAmounts } from "./cost-amounts";

describe("CostAmounts", () => {
  it("shows the estimated amount with an accessible label", () => {
    render(<CostAmounts estimatedMinor={12300} actualMinor={0} currency="AUD" />);
    expect(screen.getByText("$123.00")).toBeInTheDocument();
    expect(screen.getByLabelText(/estimated/i)).toBeInTheDocument();
  });

  it("renders a '—' placeholder in the spent column when actual is 0 (columns stay aligned)", () => {
    render(<CostAmounts estimatedMinor={12300} actualMinor={0} currency="AUD" />);
    const spent = screen.getByLabelText(/spent/i);
    expect(spent).toBeInTheDocument();
    expect(spent).toHaveTextContent("—");
  });

  it("shows the actual amount in the spent style when > 0", () => {
    render(<CostAmounts estimatedMinor={12300} actualMinor={9900} currency="AUD" />);
    const spent = screen.getByLabelText(/spent/i);
    expect(spent).toHaveTextContent("$99.00");
    expect(spent.className).toContain("text-emerald-600");
  });

  it("does not show the actual amount text when actual is 0 (just a placeholder)", () => {
    render(<CostAmounts estimatedMinor={12300} actualMinor={0} currency="AUD" />);
    const spent = screen.getByLabelText(/spent/i);
    // Placeholder, not a real money string
    expect(spent).toHaveTextContent("—");
    expect(spent).not.toHaveTextContent("$");
  });

  it("does not shrink, so the adjacent label truncates instead of overflowing", () => {
    const { container } = render(<CostAmounts estimatedMinor={1000} actualMinor={0} currency="AUD" />);
    expect(container.firstElementChild?.className).toContain("shrink-0");
  });
});
