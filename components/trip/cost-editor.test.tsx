import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));
import { createCost, updateCost } from "@/server/actions/costs";

import { CostEditor } from "./cost-editor";
import type { CostRow } from "@/server/actions/costs";

const baseProps = {
  tripId: "trip-1",
  ownerType: "TRANSPORT" as const,
  ownerId: "owner-1",
  costs: [] as CostRow[],
  homeCurrency: "AUD",
  defaultCurrency: "AUD",
};

const sampleCost: CostRow = {
  id: "cost-1",
  estimatedMinor: 5000,
  actualMinor: null,
  currency: "AUD",
  rateToHome: 1,
  paidAt: null,
  ownerType: "TRANSPORT",
  ownerId: "owner-1",
  label: null,
  category: null,
};

describe("CostEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("add flow: estimated only -> createCost called with estimatedMinor: 1250 and actualMinor: undefined", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} />);

    // Open the add dialog
    await user.click(screen.getByRole("button", { name: /add cost/i }));

    // Type in the estimated amount field
    const estimatedInput = screen.getByLabelText("Estimated cost amount");
    await user.clear(estimatedInput);
    await user.type(estimatedInput, "12.50");

    // Submit the form
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        estimatedMinor: 1250,
        actualMinor: undefined,
        currency: "AUD",
      }),
    );
  });

  it("typing both estimated and actual produces both as minor units in createCost payload", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add cost/i }));

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
      }),
    );
  });

  it("editing an existing cost opens a prefilled edit dialog and calls updateCost", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} costs={[sampleCost]} />);

    // Click the edit (pencil) button on the existing cost row
    await user.click(screen.getByRole("button", { name: /edit cost/i }));

    // The estimated field should be prefilled from sampleCost.estimatedMinor = 5000 -> "50.00"
    const estimatedInput = screen.getByLabelText("Estimated cost amount");
    expect(estimatedInput).toHaveValue("50.00");

    // Submit without changes
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(updateCost).toHaveBeenCalledWith(
      "cost-1",
      expect.objectContaining({
        estimatedMinor: 5000,
        currency: "AUD",
      }),
    );
  });
});
