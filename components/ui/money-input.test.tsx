import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { MoneyInput } from "./money-input";
import type { MoneyValue } from "@/lib/money/money";
import { CURRENCY_CODES } from "@/lib/money/currencies";
import { TripCurrenciesProvider } from "@/components/money/trip-currencies-context";

function inTrip(ui: React.ReactElement) {
  return (
    <TripCurrenciesProvider homeCurrency="AUD" currencies={["AUD", "EUR", "THB"]}>
      {ui}
    </TripCurrenciesProvider>
  );
}

const optionNames = () => screen.getAllByRole("option").map((o) => o.textContent);

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

  it("currency trigger is wide enough to fit a 3-letter code on mobile (LA-033)", () => {
    render(<MoneyInput currency="EUR" amount="" onValueChange={() => {}} />);
    expect(screen.getByLabelText("Currency")).toHaveClass("w-[5.5rem]");
  });

  it("currency trigger has responsive width classes: w-[5.5rem] mobile, sm:w-24 desktop", () => {
    render(<MoneyInput currency="EUR" amount="" onValueChange={() => {}} />);
    const trigger = screen.getByLabelText("Currency");
    expect(trigger.className).toContain("w-[5.5rem]");
    expect(trigger.className).toContain("sm:w-24");
  });

  it("currency trigger fits a 3-letter code (LA-033)", () => {
    render(<MoneyInput currency="AUD" amount="" onValueChange={() => {}} />);
    const trigger = screen.getByRole("combobox");
    expect(trigger.className).toContain("w-[5.5rem]");
  });

  describe("the trip's currencies", () => {
    it("the list shows the trip's currencies and More currencies", async () => {
      const user = userEvent.setup();
      render(inTrip(<MoneyInput currency="AUD" amount="" />));
      await user.click(screen.getByRole("combobox", { name: "Currency" }));
      expect(optionNames()).toEqual(["AUD", "EUR", "THB", "More currencies"]);
    });

    it("the field's own currency is listed when the trip does not use it", async () => {
      const user = userEvent.setup();
      render(inTrip(<MoneyInput currency="GBP" amount="" />));
      await user.click(screen.getByRole("combobox", { name: "Currency" }));
      expect(optionNames()).toEqual(["AUD", "EUR", "THB", "GBP", "More currencies"]);
    });

    it("More currencies swaps to every currency, the trip's first, without changing the value", async () => {
      const user = userEvent.setup();
      const onCurrencyChange = vi.fn();
      const onValueChange = vi.fn();
      render(
        inTrip(
          <MoneyInput
            currency="AUD"
            amount="5"
            onCurrencyChange={onCurrencyChange}
            onValueChange={onValueChange}
          />,
        ),
      );
      await user.click(screen.getByRole("combobox", { name: "Currency" }));
      await user.click(screen.getByRole("option", { name: "More currencies" }));

      expect(onCurrencyChange).not.toHaveBeenCalled();
      expect(onValueChange).not.toHaveBeenCalled();
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      const names = optionNames();
      expect(names.slice(0, 3)).toEqual(["AUD", "EUR", "THB"]);
      expect(names).toHaveLength(CURRENCY_CODES.length);
      expect(names).not.toContain("More currencies");
    });

    it("More currencies is reachable and usable from the keyboard", async () => {
      const user = userEvent.setup();
      const onCurrencyChange = vi.fn();
      render(inTrip(<MoneyInput currency="AUD" amount="" onCurrencyChange={onCurrencyChange} />));
      screen.getByRole("combobox", { name: "Currency" }).focus();
      await user.keyboard("{Enter}");
      await user.keyboard("{End}{Enter}");

      expect(onCurrencyChange).not.toHaveBeenCalled();
      expect(optionNames()).toHaveLength(CURRENCY_CODES.length);
      const list = screen.getByRole("listbox");
      expect(list.contains(document.activeElement)).toBe(true);
      await user.keyboard("{ArrowDown}{Enter}");
      expect(onCurrencyChange).toHaveBeenCalledTimes(1);
      expect(CURRENCY_CODES).toContain(onCurrencyChange.mock.calls[0][0]);
    });

    it("picking from the full list sets it", async () => {
      const user = userEvent.setup();
      const onCurrencyChange = vi.fn();
      const onValueChange = vi.fn();
      render(
        inTrip(
          <MoneyInput
            currency="AUD"
            amount="5"
            onCurrencyChange={onCurrencyChange}
            onValueChange={onValueChange}
          />,
        ),
      );
      await user.click(screen.getByRole("combobox", { name: "Currency" }));
      await user.click(screen.getByRole("option", { name: "More currencies" }));
      await user.click(screen.getByRole("option", { name: "JPY" }));

      expect(onCurrencyChange).toHaveBeenCalledTimes(1);
      expect(onCurrencyChange).toHaveBeenCalledWith("JPY");
      expect(onValueChange).toHaveBeenLastCalledWith({ amountMinor: 5, currency: "JPY" });
    });

    it("the list is back to the trip's currencies the next time it opens", async () => {
      const user = userEvent.setup();
      render(inTrip(<MoneyInput currency="AUD" amount="" />));
      await user.click(screen.getByRole("combobox", { name: "Currency" }));
      await user.click(screen.getByRole("option", { name: "More currencies" }));
      await user.keyboard("{Escape}");
      await user.click(screen.getByRole("combobox", { name: "Currency" }));
      expect(optionNames()).toEqual(["AUD", "EUR", "THB", "More currencies"]);
    });

    it("with no provider every currency is listed and there is no More currencies", async () => {
      const user = userEvent.setup();
      render(<MoneyInput currency="AUD" amount="" />);
      await user.click(screen.getByRole("combobox", { name: "Currency" }));
      expect(optionNames()).toEqual([...CURRENCY_CODES]);
    });

    it("a given list is used as is", async () => {
      const user = userEvent.setup();
      render(inTrip(<MoneyInput currency="EUR" amount="" currencies={["EUR", "USD"]} />));
      await user.click(screen.getByRole("combobox", { name: "Currency" }));
      expect(optionNames()).toEqual(["EUR", "USD"]);
    });

    it("a one-entry list is plain text, not a combobox", () => {
      render(inTrip(<MoneyInput currency="AUD" amount="" currencies={["AUD"]} />));
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      expect(screen.getByText("AUD")).toBeVisible();
    });

    it("the list is capped and scrolls", async () => {
      const user = userEvent.setup();
      render(inTrip(<MoneyInput currency="AUD" amount="" />));
      await user.click(screen.getByRole("combobox", { name: "Currency" }));
      expect(screen.getByRole("listbox").className).toContain("max-h-[min(18rem");
    });

    it("the picker takes its accessible name from currencyLabel", () => {
      render(inTrip(<MoneyInput currency="AUD" amount="" currencyLabel="You paid currency" />));
      expect(screen.getByRole("combobox", { name: "You paid currency" })).toBeInTheDocument();
    });

    it("a trip currency is picked straight from the short list and the list closes", async () => {
      const user = userEvent.setup();
      const onCurrencyChange = vi.fn();
      render(inTrip(<MoneyInput currency="AUD" amount="" onCurrencyChange={onCurrencyChange} />));
      await user.click(screen.getByRole("combobox", { name: "Currency" }));
      await user.click(screen.getByRole("option", { name: "THB" }));
      expect(onCurrencyChange).toHaveBeenCalledTimes(1);
      expect(onCurrencyChange).toHaveBeenCalledWith("THB");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("typing on the closed picker does not leave it stuck open after a real pick", async () => {
      const user = userEvent.setup();
      const onCurrencyChange = vi.fn();
      render(inTrip(<MoneyInput currency="AUD" amount="" onCurrencyChange={onCurrencyChange} />));
      screen.getByRole("combobox", { name: "Currency" }).focus();
      await user.keyboard("m");
      expect(onCurrencyChange).not.toHaveBeenCalled();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

      await user.click(screen.getByRole("combobox", { name: "Currency" }));
      await user.click(screen.getByRole("option", { name: "EUR" }));
      expect(onCurrencyChange).toHaveBeenCalledTimes(1);
      expect(onCurrencyChange).toHaveBeenCalledWith("EUR");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("a one-entry list is a named group", () => {
      render(inTrip(<MoneyInput currency="AUD" amount="" currencies={["AUD"]} currencyLabel="You paid currency" />));
      expect(screen.getByRole("group", { name: "You paid currency" })).toHaveTextContent("AUD");
    });
  });
});
