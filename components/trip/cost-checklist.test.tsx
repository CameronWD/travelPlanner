import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const markCostPaid = vi.fn().mockResolvedValue({ success: true });
const markCostUnpaid = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/server/actions/costs", () => ({
  markCostPaid: (...a: unknown[]) => markCostPaid(...a),
  markCostUnpaid: (...a: unknown[]) => markCostUnpaid(...a),
}));

import { CostChecklist } from "./cost-checklist";

afterEach(() => {
  vi.clearAllMocks();
  markCostPaid.mockResolvedValue({ success: true });
  markCostUnpaid.mockResolvedValue({ success: true });
});

const rows = [
  { id: "c1", label: "Hotel Ibis", costMinor: 34000, paidMinor: null,
    currency: "GBP", paidAt: null },
  { id: "c2", label: "Pensione Roma", costMinor: 21000, paidMinor: 21000,
    currency: "GBP", paidAt: new Date("2026-06-04") },
];

describe("CostChecklist", () => {
  it("lists every cost with its paid state", () => {
    render(<CostChecklist rows={rows} />);
    expect(screen.getByText("Hotel Ibis")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /hotel ibis/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /pensione roma/i })).toBeChecked();
  });

  it("asks how much before marking paid, prefilled with the cost", async () => {
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} />);

    await user.click(screen.getByRole("checkbox", { name: /hotel ibis/i }));

    expect(screen.getByText(/paid how much/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/you paid amount/i)).toHaveValue("340.00");
    expect(markCostPaid).not.toHaveBeenCalled();
  });

  it("marks paid on confirm", async () => {
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} />);

    await user.click(screen.getByRole("checkbox", { name: /hotel ibis/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(markCostPaid).toHaveBeenCalledWith("c1", 34000, expect.any(String));
  });

  it("refuses to confirm an unparseable amount, and never calls markCostPaid", async () => {
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} />);

    await user.click(screen.getByRole("checkbox", { name: /hotel ibis/i }));
    const amountInput = screen.getByLabelText(/you paid amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "-");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(markCostPaid).not.toHaveBeenCalled();
    expect(screen.getByText(/enter what you paid/i)).toBeInTheDocument();
  });

  it("confirms a genuine zero paid amount", async () => {
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} />);

    await user.click(screen.getByRole("checkbox", { name: /hotel ibis/i }));
    const amountInput = screen.getByLabelText(/you paid amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "0");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(markCostPaid).toHaveBeenCalledWith("c1", 0, expect.any(String));
  });

  it("clicking a paid row un-marks it and does not open the popover", async () => {
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} />);

    await user.click(screen.getByRole("checkbox", { name: /pensione roma/i }));

    expect(markCostUnpaid).toHaveBeenCalledWith("c2");
    expect(markCostPaid).not.toHaveBeenCalled();
    // Radix's PopoverTrigger composes its own click-to-toggle onto the
    // checkbox regardless of our handler, so un-marking must preventDefault
    // that click — otherwise the confirm pops open right after un-marking.
    expect(screen.queryByText(/paid how much/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/you paid amount/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
  });

  it("shows every owner-type label, including a standalone other cost", () => {
    const mixedRows = [
      ...rows,
      { id: "c3", label: "Travel insurance", costMinor: 5000, paidMinor: null,
        currency: "GBP", paidAt: null },
    ];
    render(<CostChecklist rows={mixedRows} />);
    expect(screen.getByText("Travel insurance")).toBeInTheDocument();
  });
});
