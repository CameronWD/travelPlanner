import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));
import { createCost, updateCost, deleteCost } from "@/server/actions/costs";

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
  costMinor: 5000,
  paidMinor: null,
  currency: "AUD",
  rateToHome: 1,
  paidAt: null,
  ownerType: "TRANSPORT",
  ownerId: "owner-1",
  label: null,
  category: null,
};

const labeledCost: CostRow = {
  id: "cost-2",
  costMinor: 3500,
  paidMinor: null,
  currency: "AUD",
  rateToHome: 1,
  paidAt: null,
  ownerType: "TRANSPORT",
  ownerId: "owner-1",
  label: "Train ticket",
  category: null,
};

describe("CostEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("add flow: cost only -> createCost called with costMinor: 1250 and paidMinor: undefined", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} />);

    // Open the add dialog
    await user.click(screen.getByRole("button", { name: /add cost/i }));

    // Type in the cost amount field
    const estimatedInput = screen.getByLabelText("Cost amount");
    await user.clear(estimatedInput);
    await user.type(estimatedInput, "12.50");

    // Submit the form
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        costMinor: 1250,
        paidMinor: undefined,
        currency: "AUD",
      }),
    );
  });

  it("typing both cost and paid amounts produces both as minor units in createCost payload", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add cost/i }));

    const estimatedInput = screen.getByLabelText("Cost amount");
    await user.clear(estimatedInput);
    await user.type(estimatedInput, "50.00");

    const actualInput = screen.getByLabelText("You paid amount");
    await user.clear(actualInput);
    await user.type(actualInput, "48.75");

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        costMinor: 5000,
        paidMinor: 4875,
      }),
    );
  });

  it("deleting a cost shows a dialog with the cost label and calls deleteCost on confirm", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} costs={[labeledCost]} />);

    await user.click(screen.getByRole("button", { name: /delete cost/i }));

    // Dialog appears with the cost label
    expect(await screen.findByText(/Train ticket/)).toBeInTheDocument();

    // Click the Delete button
    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    await user.click(deleteBtn);

    expect(deleteCost).toHaveBeenCalledWith("cost-2");
  });

  it("editing an existing cost opens a prefilled edit dialog and calls updateCost", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} costs={[sampleCost]} />);

    // Click the edit (pencil) button on the existing cost row
    await user.click(screen.getByRole("button", { name: /edit cost/i }));

    // The cost field should be prefilled from sampleCost.costMinor = 5000 -> "50.00"
    const estimatedInput = screen.getByLabelText("Cost amount");
    expect(estimatedInput).toHaveValue("50.00");

    // Submit without changes
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(updateCost).toHaveBeenCalledWith(
      "cost-1",
      expect.objectContaining({
        costMinor: 5000,
        currency: "AUD",
      }),
    );
  });

  it("a field error (costMinor) sets aria-invalid on the cost field and renders via Field error slot", async () => {
    (createCost as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { costMinor: ["Amount is required"] },
    });

    const user = userEvent.setup();
    render(<CostEditor {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add cost/i }));
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Amount is required")).toBeInTheDocument();
    const estimatedInput = screen.getByLabelText("Cost amount");
    expect(estimatedInput).toHaveAttribute("aria-invalid", "true");
  });

  it("a _form error appears with role=alert via FormError", async () => {
    (createCost as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _form: ["Server error"] },
    });

    const user = userEvent.setup();
    render(<CostEditor {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add cost/i }));

    const estimatedInput = screen.getByLabelText("Cost amount");
    await user.clear(estimatedInput);
    await user.type(estimatedInput, "10.00");

    await user.click(screen.getByRole("button", { name: /save/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Server error");
  });
});
