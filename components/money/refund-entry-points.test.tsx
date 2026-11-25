import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  updateCost: vi.fn(async () => ({ success: true })),
  createCost: vi.fn(async () => ({ success: true })),
  deleteCost: vi.fn(async () => ({ success: true })),
  recordRefund: vi.fn(async () => ({ success: true })),
  markRefundReceived: vi.fn(async () => ({ success: true })),
  clearRefund: vi.fn(async () => ({ success: true })),
}));
vi.mock("@/server/actions/costs", () => actions);

import { OwnedCostFormDialog } from "@/components/trip/cost-editor";
import { OtherCostFormDialog } from "@/components/trip/other-cost-editor";
import type { CostRow } from "@/server/actions/costs";

const base: CostRow = {
  id: "c1", costMinor: 20000, paidMinor: null, currency: "AUD", rateToHome: 1, paidAt: null, dueDate: null,
  settlement: "BEFORE", ownerType: "ACCOMMODATION", ownerId: "o1", label: "Hotel", category: null,
};
const paid: CostRow = { ...base, paidMinor: 20000, paidAt: new Date("2026-09-02"), refundMinor: 5000 };

const editors = [
  ["OwnedCostFormDialog", (cost: CostRow) => <OwnedCostFormDialog cost={cost} homeCurrency="AUD" open onOpenChange={() => {}} />],
  ["OtherCostFormDialog", (cost: CostRow) => <OtherCostFormDialog tripId="t1" homeCurrency="AUD" cost={{ ...cost, ownerType: "OTHER", ownerId: null }} open onOpenChange={() => {}} />],
] as const;

beforeEach(() => vi.clearAllMocks());

describe.each(editors)("%s refund entry point", (_name, renderEditor) => {
  it("shows the Refund button and tag for a paid Cost only", () => {
    const { unmount } = render(renderEditor(paid));
    expect(screen.getByRole("button", { name: "Refund" })).toBeInTheDocument();
    expect(screen.getByText(/refund expected/)).toBeInTheDocument();
    unmount();
    render(renderEditor(base));
    expect(screen.queryByRole("button", { name: "Refund" })).toBeNull();
    expect(screen.queryByText(/refund expected/)).toBeNull();
  });

  it("Save in the Refund dialog records the refund and never submits the outer form", async () => {
    const user = userEvent.setup();
    render(renderEditor(paid));
    await user.click(screen.getByRole("button", { name: "Refund" }));
    const dialog = await screen.findByRole("dialog", { name: "Refund" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(actions.recordRefund).toHaveBeenCalledWith("c1", 5000, null));
    expect(actions.updateCost).not.toHaveBeenCalled();
  });

  it("Enter in the amount input saves the refund and never submits the outer form", async () => {
    const user = userEvent.setup();
    render(renderEditor(paid));
    await user.click(screen.getByRole("button", { name: "Refund" }));
    const dialog = await screen.findByRole("dialog", { name: "Refund" });
    await user.type(within(dialog).getByLabelText("Refund amount"), "{Enter}");
    await waitFor(() => expect(actions.recordRefund).toHaveBeenCalledTimes(1));
    expect(actions.updateCost).not.toHaveBeenCalled();
  });
});
