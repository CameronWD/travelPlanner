import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));
import { createCost, updateCost } from "@/server/actions/costs";
import { OtherCostFormDialog } from "@/components/trip/other-cost-editor";
import { OwnedCostFormDialog } from "@/components/trip/cost-editor";
import type { CostRow } from "@/server/actions/costs";

const other: CostRow = {
  id: "cost-1", costMinor: 1250, paidMinor: null, currency: "AUD", rateToHome: 1, paidAt: null, dueDate: null,
  settlement: "BEFORE", ownerType: "OTHER", ownerId: null, label: "Travel insurance", category: "Insurance",
};
const owned: CostRow = { ...other, id: "cost-2", ownerType: "ACCOMMODATION", ownerId: "acc-1", label: null, category: null, costMinor: 50000 };

beforeEach(() => vi.clearAllMocks());

describe("OtherCostFormDialog", () => {
  it("creates an Other cost and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<OtherCostFormDialog tripId="trip-1" homeCurrency="AUD" open onOpenChange={onOpenChange} />);
    expect(screen.getByRole("heading", { name: "Add a cost" })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/travel insurance/i), "eSIM");
    await user.type(screen.getByLabelText(/cost amount/i), "30");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(createCost).toHaveBeenCalledWith("trip-1", expect.objectContaining({ costMinor: 3000, ownerType: "OTHER", label: "eSIM" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("edits an existing cost, prefilled", async () => {
    const user = userEvent.setup();
    render(<OtherCostFormDialog tripId="trip-1" homeCurrency="AUD" cost={other} open onOpenChange={() => {}} />);
    expect(screen.getByRole("heading", { name: "Edit cost" })).toBeInTheDocument();
    expect(screen.getByLabelText(/cost amount/i)).toHaveValue("12.50");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(updateCost).toHaveBeenCalledWith("cost-1", expect.objectContaining({ costMinor: 1250, ownerType: "OTHER" }));
  });

  it("refuses a blank amount without calling the server", async () => {
    const user = userEvent.setup();
    render(<OtherCostFormDialog tripId="trip-1" homeCurrency="AUD" open onOpenChange={() => {}} />);
    await user.type(screen.getByPlaceholderText(/travel insurance/i), "eSIM");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(createCost).not.toHaveBeenCalled();
    expect(await screen.findByText("Enter the cost")).toBeInTheDocument();
  });
});

describe("OwnedCostFormDialog", () => {
  it("edits the cost on its owner, keeping owner type and id", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<OwnedCostFormDialog cost={owned} homeCurrency="AUD" open onOpenChange={onOpenChange} />);
    expect(screen.getByLabelText(/cost amount/i)).toHaveValue("500.00");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(updateCost).toHaveBeenCalledWith("cost-2", expect.objectContaining({ costMinor: 50000, ownerType: "ACCOMMODATION", ownerId: "acc-1" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
