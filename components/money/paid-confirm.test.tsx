import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const markCostPaid = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/server/actions/costs", () => ({
  markCostPaid: (...a: unknown[]) => markCostPaid(...a),
}));

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  toast: (...a: unknown[]) => toastMock(...a),
}));

import { PaidConfirm, type PaidConfirmRow } from "./paid-confirm";

afterEach(() => {
  vi.clearAllMocks();
  markCostPaid.mockResolvedValue({ success: true });
});

const row: PaidConfirmRow = {
  id: "c1",
  label: "Hotel Ibis",
  costMinor: 34000,
  paidMinor: null,
  currency: "GBP",
};

describe("PaidConfirm", () => {
  it("asks how much, prefilled with the cost", () => {
    render(<PaidConfirm row={row} onCancel={vi.fn()} onDone={vi.fn()} />);

    expect(screen.getByText(/paid how much/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/you paid amount/i)).toHaveValue("340.00");
    expect(markCostPaid).not.toHaveBeenCalled();
  });

  it("marks paid on confirm", async () => {
    const user = userEvent.setup();
    render(<PaidConfirm row={row} onCancel={vi.fn()} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(markCostPaid).toHaveBeenCalledWith("c1", 34000, expect.any(String));
  });

  it("refuses to confirm an unparseable amount, and never calls markCostPaid", async () => {
    const user = userEvent.setup();
    render(<PaidConfirm row={row} onCancel={vi.fn()} onDone={vi.fn()} />);

    const amountInput = screen.getByLabelText(/you paid amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "-");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(markCostPaid).not.toHaveBeenCalled();
    expect(screen.getByText(/enter what you paid/i)).toBeInTheDocument();
  });

  it("confirms a genuine zero paid amount", async () => {
    const user = userEvent.setup();
    render(<PaidConfirm row={row} onCancel={vi.fn()} onDone={vi.fn()} />);

    const amountInput = screen.getByLabelText(/you paid amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "0");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(markCostPaid).toHaveBeenCalledWith("c1", 0, expect.any(String));
  });

  it("refuses to submit an empty date", async () => {
    const user = userEvent.setup();
    render(<PaidConfirm row={row} onCancel={vi.fn()} onDone={vi.fn()} />);

    const dateInput = screen.getByLabelText(/date paid/i);
    fireEvent.change(dateInput, { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(markCostPaid).not.toHaveBeenCalled();
    expect(screen.getByText(/enter when you paid/i)).toBeInTheDocument();
  });

  it("clears submitting and shows a destructive toast when marking paid throws", async () => {
    markCostPaid.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<PaidConfirm row={row} onCancel={vi.fn()} onDone={vi.fn()} />);

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await user.click(confirmButton);

    await waitFor(() => expect(confirmButton).not.toBeDisabled());
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });

  it("locks the confirm to the row's currency instead of offering a picker", async () => {
    const user = userEvent.setup();
    const rowInAud: PaidConfirmRow = {
      id: "c-aud", label: "Onsen entry", costMinor: 5000, paidMinor: null, currency: "AUD",
    };
    render(<PaidConfirm row={rowInAud} onCancel={vi.fn()} onDone={vi.fn()} />);

    expect(screen.getByText(/paid how much/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /currency/i })).not.toBeInTheDocument();
    expect(screen.getByText("AUD")).toBeInTheDocument();
    void user;
  });

  it("prefills the preserved paid amount over the cost amount", () => {
    const untickedRow: PaidConfirmRow = {
      id: "c-untick", label: "Ferry", costMinor: 10000, paidMinor: 9500, currency: "GBP",
    };
    render(<PaidConfirm row={untickedRow} onCancel={vi.fn()} onDone={vi.fn()} />);

    expect(screen.getByLabelText("You paid amount")).toHaveValue("95.00");
  });

  it("surfaces a server amount field error on the field", async () => {
    markCostPaid.mockResolvedValueOnce({
      success: false,
      errors: { paidMinor: ["Amount is too large"] },
    });
    const user = userEvent.setup();
    render(<PaidConfirm row={row} onCancel={vi.fn()} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(await screen.findByText("Amount is too large")).toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("surfaces a server date field error on the field", async () => {
    markCostPaid.mockResolvedValueOnce({
      success: false,
      errors: { paidAt: ["Enter when you paid"] },
    });
    const user = userEvent.setup();
    render(<PaidConfirm row={row} onCancel={vi.fn()} onDone={vi.fn()} />);

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
    render(<PaidConfirm row={row} onCancel={vi.fn()} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
    expect(screen.queryByText("Something else broke")).not.toBeInTheDocument();
  });

  it("prefills Date paid with the device-local today", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-14T22:00:00Z")); // next local day in TZ=Australia/Sydney
    render(<PaidConfirm row={row} onCancel={vi.fn()} onDone={vi.fn()} />);

    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(screen.getByLabelText("Date paid")).toHaveValue(expected);
    vi.useRealTimers();
  });
});
