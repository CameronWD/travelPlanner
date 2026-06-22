"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toMoneyValue, type MoneyValue } from "@/lib/money";
import { cn } from "@/lib/cn";

/** A small default set; trips can pass their own list. */
export const DEFAULT_CURRENCIES = [
  "AUD",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "NZD",
  "CAD",
  "CHF",
  "SGD",
  "THB",
] as const;

export interface MoneyInputProps {
  /** Currency code (controlled). */
  currency: string;
  /** Raw amount text (controlled). */
  amount?: string;
  /** Currencies offered in the picker. Defaults to DEFAULT_CURRENCIES. */
  currencies?: readonly string[];
  /** Fired with the parsed money object (or null if unparseable). */
  onValueChange?: (value: MoneyValue | null) => void;
  /** Fired with the raw amount string on every keystroke. */
  onAmountChange?: (amount: string) => void;
  /** Fired when the currency changes. */
  onCurrencyChange?: (currency: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

/**
 * Amount field + currency picker that emits a parsed
 * `{ amountMinor, currency }` object. Parsing lives in `lib/money` so it is
 * unit-tested independently.
 */
const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      currency,
      amount = "",
      currencies = DEFAULT_CURRENCIES,
      onValueChange,
      onAmountChange,
      onCurrencyChange,
      placeholder = "0.00",
      disabled,
      invalid,
      id,
      className,
      "aria-label": ariaLabel,
    },
    ref,
  ) => {
    const emit = React.useCallback(
      (nextAmount: string, nextCurrency: string) => {
        onValueChange?.(toMoneyValue(nextAmount, nextCurrency));
      },
      [onValueChange],
    );

    const handleAmount = (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      onAmountChange?.(next);
      emit(next, currency);
    };

    const handleCurrency = (next: string) => {
      onCurrencyChange?.(next);
      emit(amount, next);
    };

    return (
      <div className={cn("flex items-stretch gap-2", className)}>
        <Input
          ref={ref}
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder}
          value={amount}
          onChange={handleAmount}
          disabled={disabled}
          invalid={invalid}
          aria-label={ariaLabel ?? "Amount"}
          className="min-w-0 flex-1"
        />
        <Select
          value={currency}
          onValueChange={handleCurrency}
          disabled={disabled}
        >
          <SelectTrigger
            className="w-24 shrink-0"
            aria-label="Currency"
          >
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            {currencies.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  },
);
MoneyInput.displayName = "MoneyInput";

export { MoneyInput };
