import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { MoneyInput } from "./money-input";
import type { MoneyValue } from "@/lib/money";

/** Controlled wrapper so typing updates the amount and re-emits. */
function Harness({
  onValueChange,
  currency = "EUR",
}: {
  onValueChange: (v: MoneyValue | null) => void;
  currency?: string;
}) {
  const [amount, setAmount] = React.useState("");
  return (
    <MoneyInput
      currency={currency}
      amount={amount}
      onAmountChange={setAmount}
      onValueChange={onValueChange}
    />
  );
}

describe("MoneyInput", () => {
  it("emits { amountMinor: 1250, currency: 'EUR' } for '12.50' in EUR", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} currency="EUR" />);

    await user.type(screen.getByLabelText("Amount"), "12.50");

    expect(onValueChange).toHaveBeenLastCalledWith({
      amountMinor: 1250,
      currency: "EUR",
    });
  });

  it("treats whole numbers as major units (1234 -> 123400)", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} currency="EUR" />);

    await user.type(screen.getByLabelText("Amount"), "1234");

    expect(onValueChange).toHaveBeenLastCalledWith({
      amountMinor: 123400,
      currency: "EUR",
    });
  });

  it("emits null for invalid input", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} currency="EUR" />);

    await user.type(screen.getByLabelText("Amount"), "abc");

    expect(onValueChange).toHaveBeenLastCalledWith(null);
  });

  it("renders a currency trigger reflecting the selected currency", () => {
    render(
      <MoneyInput currency="GBP" amount="" onValueChange={() => {}} />,
    );
    expect(
      screen.getByRole("combobox", { name: "Currency" }),
    ).toHaveTextContent("GBP");
  });

  it("amount input has min-w-0 class so it can shrink on narrow screens", () => {
    render(<MoneyInput currency="EUR" amount="" onValueChange={() => {}} />);
    expect(screen.getByLabelText("Amount")).toHaveClass("min-w-0");
  });

  it("currency trigger has w-24 class for the narrower picker width", () => {
    render(<MoneyInput currency="EUR" amount="" onValueChange={() => {}} />);
    expect(screen.getByLabelText("Currency")).toHaveClass("w-24");
  });
});
