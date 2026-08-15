import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const markCostPaid = vi.fn().mockResolvedValue({ success: true });
const markCostUnpaid = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/server/actions/costs", () => ({
  markCostPaid: (...a: unknown[]) => markCostPaid(...a),
  markCostUnpaid: (...a: unknown[]) => markCostUnpaid(...a),
}));

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  toast: (...a: unknown[]) => toastMock(...a),
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

  it("does not wrap a paid row's checkbox in a popover trigger", () => {
    render(<CostChecklist rows={rows} />);

    const paidCheckbox = screen.getByRole("checkbox", { name: /pensione roma/i });
    const unpaidCheckbox = screen.getByRole("checkbox", { name: /hotel ibis/i });

    // A paid row can never open the confirm, so it must not carry
    // aria-haspopup/aria-expanded — those would tell a screen reader a
    // dialog is available when it can never open (only an unpaid row's
    // checkbox is wrapped in PopoverTrigger).
    expect(paidCheckbox).not.toHaveAttribute("aria-haspopup");
    expect(paidCheckbox).not.toHaveAttribute("aria-expanded");
    expect(unpaidCheckbox).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("refuses to submit an empty date, without calling markCostPaid", async () => {
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} />);

    await user.click(screen.getByRole("checkbox", { name: /hotel ibis/i }));
    const dateInput = screen.getByLabelText(/date paid/i);
    fireEvent.change(dateInput, { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(markCostPaid).not.toHaveBeenCalled();
    expect(screen.getByText(/enter when you paid/i)).toBeInTheDocument();
  });

  it("clears the pending state and shows a destructive toast when un-marking throws", async () => {
    markCostUnpaid.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} />);

    const paidCheckbox = screen.getByRole("checkbox", { name: /pensione roma/i });
    await user.click(paidCheckbox);

    // The row must not stay disabled forever — the catch/finally must run.
    await waitFor(() => expect(paidCheckbox).not.toBeDisabled());
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });

  it("clears submitting and shows a destructive toast when marking paid throws", async () => {
    markCostPaid.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} />);

    await user.click(screen.getByRole("checkbox", { name: /hotel ibis/i }));
    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await user.click(confirmButton);

    // The Confirm button must not stay stuck loading forever.
    await waitFor(() => expect(confirmButton).not.toBeDisabled());
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
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

  it("locks the confirm to the row's currency instead of offering a picker", async () => {
    const user = userEvent.setup();
    const rowInAud = [
      { id: "c-aud", label: "Onsen entry", costMinor: 5000, paidMinor: null,
        currency: "AUD", paidAt: null },
    ];
    render(<CostChecklist rows={rowInAud} />);

    await user.click(screen.getByRole("checkbox", { name: /onsen entry/i }));

    expect(screen.getByText(/paid how much/i)).toBeInTheDocument();
    // MoneyInput's currency picker always renders an interactive combobox,
    // even with a single-entry `currencies` list — so a locked-currency
    // confirm must not use it at all; it shows the code as static text.
    expect(screen.queryByRole("combobox", { name: /currency/i })).not.toBeInTheDocument();
    expect(screen.getByText("AUD")).toBeInTheDocument();
  });

  it("prefills the preserved paid amount over the cost amount", async () => {
    const user = userEvent.setup();
    const untickedRow = [
      { id: "c-untick", label: "Ferry", costMinor: 10000, paidMinor: 9500,
        currency: "GBP", paidAt: null },
    ];
    render(<CostChecklist rows={untickedRow} />);

    await user.click(screen.getByRole("checkbox", { name: /ferry/i }));

    expect(screen.getByLabelText("You paid amount")).toHaveValue("95.00");
  });

  it("keeps focus on the checkbox while un-marking", async () => {
    let resolveUnmark: (v: { success: true }) => void = () => {};
    markCostUnpaid.mockImplementationOnce(
      () => new Promise((resolve) => { resolveUnmark = resolve; }),
    );
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} />);

    const cb = screen.getByRole("checkbox", { name: /pensione roma/i });
    cb.focus();
    await user.click(cb);

    // While the unmark is still in flight, the checkbox must stay enabled
    // and focused — disabling it here bounces focus to <body> mid-gesture.
    expect(cb).not.toBeDisabled();
    expect(document.activeElement).toBe(cb);

    resolveUnmark({ success: true });
    await waitFor(() => expect(cb).not.toBeDisabled());
  });

  it("surfaces a server amount field error on the field, not a toast", async () => {
    markCostPaid.mockResolvedValueOnce({
      success: false,
      errors: { paidMinor: ["Amount is too large"] },
    });
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} />);

    await user.click(screen.getByRole("checkbox", { name: /hotel ibis/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(await screen.findByText("Amount is too large")).toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("surfaces a server date field error on the field, not a toast", async () => {
    markCostPaid.mockResolvedValueOnce({
      success: false,
      errors: { paidAt: ["Enter when you paid"] },
    });
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} />);

    await user.click(screen.getByRole("checkbox", { name: /hotel ibis/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(await screen.findByText(/enter when you paid/i)).toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("falls back to a generic toast when the server fails without field errors", async () => {
    markCostPaid.mockResolvedValueOnce({
      success: false,
      errors: { _: ["Something else broke"] },
    });
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} />);

    await user.click(screen.getByRole("checkbox", { name: /hotel ibis/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
    expect(screen.queryByText("Something else broke")).not.toBeInTheDocument();
  });

  it("prefills Date paid with the device-local today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-14T22:00:00Z")); // next local day in TZ=Australia/Sydney
    const user = userEvent.setup();
    render(<CostChecklist rows={rows} />);

    await user.click(screen.getByRole("checkbox", { name: /hotel ibis/i }));

    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(screen.getByLabelText("Date paid")).toHaveValue(expected);
    vi.useRealTimers();
  });
});
