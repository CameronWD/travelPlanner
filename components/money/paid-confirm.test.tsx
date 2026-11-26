import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { TripCurrenciesProvider } from "@/components/money/trip-currencies-context";

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

describe("PaidConfirm: the paid currency (spec 2026-11-26 §2)", () => {
  const inTrip = (ui: React.ReactElement) => (
    <TripCurrenciesProvider homeCurrency="AUD" currencies={["AUD", "JPY"]}>{ui}</TripCurrenciesProvider>
  );
  const jpy: PaidConfirmRow = { id: "c-jpy", label: "Ryokan", costMinor: 12000, paidMinor: null, currency: "JPY" };
  const jpyPaidInAud: PaidConfirmRow = { ...jpy, paidMinor: 15050, paidCurrency: "AUD" };

  it("offers the Cost's currency and Home", async () => {
    const user = userEvent.setup();
    render(inTrip(<PaidConfirm row={jpy} onCancel={vi.fn()} onDone={vi.fn()} />));
    expect(screen.getByLabelText("You paid amount")).toHaveValue("12000");
    await user.click(screen.getByRole("combobox", { name: "You paid currency" }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["JPY", "AUD"]);
  });

  it("switching currency clears the amount", async () => {
    const user = userEvent.setup();
    render(inTrip(<PaidConfirm row={jpy} onCancel={vi.fn()} onDone={vi.fn()} />));
    await user.click(screen.getByRole("combobox", { name: "You paid currency" }));
    await user.click(screen.getByRole("option", { name: "AUD" }));
    expect(screen.getByLabelText("You paid amount")).toHaveValue("");
  });

  it("Mark partly paid in Home sends the amount in Home", async () => {
    const user = userEvent.setup();
    render(inTrip(<PaidConfirm row={jpy} onCancel={vi.fn()} onDone={vi.fn()} />));
    await user.click(screen.getByRole("combobox", { name: "You paid currency" }));
    await user.click(screen.getByRole("option", { name: "AUD" }));
    await user.type(screen.getByLabelText("You paid amount"), "150.50");
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(markCostPaid).toHaveBeenCalledWith("c-jpy", 15050, expect.any(String), "AUD");
  });

  it("Mark partly paid in the Cost's currency sends null", async () => {
    const user = userEvent.setup();
    render(inTrip(<PaidConfirm row={jpyPaidInAud} onCancel={vi.fn()} onDone={vi.fn()} />));
    await user.click(screen.getByRole("combobox", { name: "You paid currency" }));
    await user.click(screen.getByRole("option", { name: "JPY" }));
    await user.type(screen.getByLabelText("You paid amount"), "12000");
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(markCostPaid).toHaveBeenCalledWith("c-jpy", 12000, expect.any(String), null);
  });

  it("a JPY Cost paid in AUD opens in AUD's decimals, and re-confirms it unchanged", async () => {
    const user = userEvent.setup();
    render(inTrip(<PaidConfirm row={jpyPaidInAud} onCancel={vi.fn()} onDone={vi.fn()} />));
    expect(screen.getByLabelText("You paid amount")).toHaveValue("150.50");
    expect(screen.getByRole("combobox", { name: "You paid currency" })).toHaveTextContent("AUD");
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(markCostPaid).toHaveBeenCalledWith("c-jpy", 15050, expect.any(String));
  });

  it("an existing Cost confirmed untouched sends exactly what it did before", async () => {
    const user = userEvent.setup();
    render(inTrip(<PaidConfirm row={jpy} onCancel={vi.fn()} onDone={vi.fn()} />));
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(markCostPaid.mock.calls[0]).toStrictEqual(["c-jpy", 12000, expect.any(String)]);
  });

  it("a refused paid currency shows on the field", async () => {
    markCostPaid.mockResolvedValueOnce({ success: false, errors: { paidCurrency: ["What you paid can only be in the cost’s currency or your trip’s home currency."] } });
    const user = userEvent.setup();
    render(inTrip(<PaidConfirm row={jpy} onCancel={vi.fn()} onDone={vi.fn()} />));
    await user.click(screen.getByRole("combobox", { name: "You paid currency" }));
    await user.click(screen.getByRole("option", { name: "AUD" }));
    await user.type(screen.getByLabelText("You paid amount"), "150.50");
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(await screen.findByText("What you paid can only be in the cost’s currency or your trip’s home currency.")).toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("is plain text when the Cost is in Home", () => {
    render(inTrip(<PaidConfirm row={{ ...jpy, currency: "AUD", costMinor: 5000 }} onCancel={vi.fn()} onDone={vi.fn()} />));
    expect(screen.queryByRole("combobox", { name: "You paid currency" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "You paid currency" })).toHaveTextContent("AUD");
  });
});
