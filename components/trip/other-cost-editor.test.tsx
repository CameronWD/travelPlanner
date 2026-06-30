import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));
import { createCost, updateCost, deleteCost } from "@/server/actions/costs";

import { OtherCostEditor } from "./other-cost-editor";
import type { CostRow } from "@/server/actions/costs";

const baseProps = {
  tripId: "trip-1",
  costs: [] as CostRow[],
  homeCurrency: "AUD",
  defaultCurrency: "AUD",
};

const sampleCost: CostRow = {
  id: "cost-1",
  estimatedMinor: 1250,
  actualMinor: null,
  currency: "AUD",
  rateToHome: 1,
  paidAt: null,
  ownerType: "OTHER",
  ownerId: null,
  label: "Travel insurance",
  category: "Insurance",
};

describe("OtherCostEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("add flow: estimated only -> createCost called with estimatedMinor: 1250 and actualMinor: undefined", async () => {
    const user = userEvent.setup();
    render(<OtherCostEditor {...baseProps} />);

    // Open the add dialog
    await user.click(screen.getByRole("button", { name: /add cost/i }));

    // Fill in description (required)
    const labelInput = screen.getByPlaceholderText(/travel insurance/i);
    await user.clear(labelInput);
    await user.type(labelInput, "Test cost");

    // Type in the estimated amount field
    const estimatedInput = screen.getByLabelText("Estimated cost amount");
    await user.clear(estimatedInput);
    await user.type(estimatedInput, "12.50");

    // Leave actual blank

    // Submit the form
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        estimatedMinor: 1250,
        actualMinor: undefined,
        currency: "AUD",
        ownerType: "OTHER",
      }),
    );
  });

  it("filling both estimated and actual parses both to minor units in createCost payload", async () => {
    const user = userEvent.setup();
    render(<OtherCostEditor {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add cost/i }));

    const labelInput = screen.getByPlaceholderText(/travel insurance/i);
    await user.clear(labelInput);
    await user.type(labelInput, "Test cost");

    const estimatedInput = screen.getByLabelText("Estimated cost amount");
    await user.clear(estimatedInput);
    await user.type(estimatedInput, "50.00");

    const actualInput = screen.getByLabelText("Actual cost amount");
    await user.clear(actualInput);
    await user.type(actualInput, "48.75");

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        estimatedMinor: 5000,
        actualMinor: 4875,
        currency: "AUD",
      }),
    );
  });

  it("editing an existing cost prefills from estimatedMinor (1250 -> '12.50') and calls updateCost", async () => {
    const user = userEvent.setup();
    render(<OtherCostEditor {...baseProps} costs={[sampleCost]} />);

    // Click the edit (pencil) button on the existing cost row
    await user.click(
      screen.getByRole("button", { name: /edit travel insurance/i }),
    );

    // The estimated field should be prefilled from sampleCost.estimatedMinor = 1250 -> "12.50"
    const estimatedInput = screen.getByLabelText("Estimated cost amount");
    expect(estimatedInput).toHaveValue("12.50");

    // Submit without changes
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(updateCost).toHaveBeenCalledWith(
      "cost-1",
      expect.objectContaining({
        estimatedMinor: 1250,
        currency: "AUD",
        ownerType: "OTHER",
      }),
    );
  });

  it("deleting a cost calls deleteCost with the cost id after browser confirm", async () => {
    // Stub window.confirm to auto-accept the native dialog
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    const user = userEvent.setup();
    render(<OtherCostEditor {...baseProps} costs={[sampleCost]} />);

    await user.click(
      screen.getByRole("button", { name: /delete travel insurance/i }),
    );

    expect(deleteCost).toHaveBeenCalledWith("cost-1");

    vi.unstubAllGlobals();
  });

  it("home-currency equivalent uses convertMinor scaling for JPY->AUD (not raw multiply)", () => {
    // ¥100,000 at rate 0.011 should display as A$1,100.00 (convertMinor result: 110000 minor AUD),
    // NOT A$11.00 (the wrong raw-multiply result: Math.round(100000 * 0.011) = 1100 minor AUD).
    const jpyCost: CostRow = {
      id: "cost-jpy",
      estimatedMinor: 100000,
      actualMinor: null,
      currency: "JPY",
      rateToHome: 0.011,
      paidAt: null,
      ownerType: "OTHER",
      ownerId: null,
      label: "Shinkansen ticket",
      category: null,
    };

    render(
      <OtherCostEditor
        {...baseProps}
        homeCurrency="AUD"
        costs={[jpyCost]}
      />,
    );

    // The correct converted display must be A$1,100.00, not A$11.00
    expect(screen.getByText(/1,100\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/≈.*11\.00/)).not.toBeInTheDocument();
  });
});
