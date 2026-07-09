import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InlineCostFields } from "./inline-cost-fields";

const base = {
  hasMultipleCosts: false,
  estimatedAmount: "",
  onEstimatedChange: vi.fn(),
  currency: "AUD",
  onCurrencyChange: vi.fn(),
  actualAmount: "",
  onActualChange: vi.fn(),
  paidAt: "",
  onPaidAtChange: vi.fn(),
  errors: {},
};

describe("InlineCostFields", () => {
  it("renders nothing when multiple costs exist", () => {
    const { container } = render(<InlineCostFields {...base} hasMultipleCosts />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the estimated field but hides actual/paid until an estimate is entered", () => {
    const { rerender } = render(<InlineCostFields {...base} />);
    expect(screen.getByText("Estimated cost")).toBeInTheDocument();
    expect(screen.queryByText("Actual cost")).not.toBeInTheDocument();

    rerender(<InlineCostFields {...base} estimatedAmount="12.50" />);
    expect(screen.getByText("Actual cost")).toBeInTheDocument();
    expect(screen.getByText("Date paid")).toBeInTheDocument();
  });
});
