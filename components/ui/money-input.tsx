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
import { toMoneyValue, type MoneyValue } from "@/lib/money/money";
import { CURRENCY_CODES } from "@/lib/money/currencies";
import { cn } from "@/lib/cn";
import { useTripCurrencies } from "@/components/money/trip-currencies-context";
import { currencyChoices, MORE_CURRENCIES } from "@/lib/money/trip-currencies";

const MORE_VALUE = "__more__";

interface MoneyInputProps {
  /** Currency code (controlled). */
  currency: string;
  /** Raw amount text (controlled). */
  amount?: string;
  /** Exactly these currencies, no "More currencies". Absent: the trip's, or every currency outside a trip. */
  currencies?: readonly string[];
  /** The picker's accessible name. */
  currencyLabel?: string;
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
      currencies,
      currencyLabel = "Currency",
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

    const trip = useTripCurrencies();
    const [open, setOpen] = React.useState(false);
    const [expanded, setExpanded] = React.useState(false);
    const keepOpen = React.useRef(false);
    const contentRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      if (!expanded) return;
      const list = contentRef.current;
      const target =
        list?.querySelector<HTMLElement>('[role="option"][data-state="checked"]') ??
        list?.querySelector<HTMLElement>('[role="option"]');
      target?.focus({ preventScroll: true });
    }, [expanded]);

    const handleSelect = (next: string) => {
      if (next === MORE_VALUE) {
        keepOpen.current = true;
        setExpanded(true);
        return;
      }
      handleCurrency(next);
    };

    const handleOpenChange = (next: boolean) => {
      if (!next && keepOpen.current) {
        keepOpen.current = false;
        return;
      }
      if (next) setExpanded(false);
      setOpen(next);
    };

    const choices = currencies ?? (trip ? currencyChoices(trip.currencies, currency, expanded) : CURRENCY_CODES);
    const offerMore = !currencies && !!trip && !expanded;

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
        {currencies?.length === 1 ? (
          <div
            aria-label={currencyLabel}
            className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md border border-input bg-muted text-sm text-muted-foreground sm:w-24"
          >
            {currencies[0]}
          </div>
        ) : (
          <Select
            value={currency}
            onValueChange={handleSelect}
            open={open}
            onOpenChange={handleOpenChange}
            disabled={disabled}
          >
            <SelectTrigger
              className="w-[5.5rem] shrink-0 gap-1 px-2.5 sm:w-24"
              aria-label={currencyLabel}
            >
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent
              ref={contentRef}
              className="max-h-[min(18rem,var(--radix-select-content-available-height))]"
            >
              {choices.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
              {offerMore && <SelectItem value={MORE_VALUE}>{MORE_CURRENCIES}</SelectItem>}
            </SelectContent>
          </Select>
        )}
      </div>
    );
  },
);
MoneyInput.displayName = "MoneyInput";

export { MoneyInput };
