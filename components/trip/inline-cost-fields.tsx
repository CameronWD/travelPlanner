"use client";

import * as React from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { CURRENCY_CODES } from "@/lib/currencies";
import { todayLocalISO } from "@/lib/dates";
import type { FieldErrors } from "@/lib/action-result";

export interface InlineCostFieldsProps {
  /** When true the CostEditor is authoritative — render nothing here. */
  hasMultipleCosts: boolean;
  costAmount: string;
  onCostChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  paid: boolean;
  onPaidChange: (v: boolean) => void;
  paidAmount: string;
  onPaidAmountChange: (v: string) => void;
  paidAt: string;
  onPaidAtChange: (v: string) => void;
  errors: FieldErrors;
  disabled?: boolean;
}

/**
 * The inline single-cost editor (cost + paid toggle) shared by the
 * transport / accommodation / item form dialogs. Ticking Paid reveals a
 * paid amount pre-filled with the cost, plus a date defaulting to today
 * (ADR 0037). Hidden entirely when >1 costs exist.
 */
export function InlineCostFields({
  hasMultipleCosts,
  costAmount,
  onCostChange,
  currency,
  onCurrencyChange,
  paid,
  onPaidChange,
  paidAmount,
  onPaidAmountChange,
  paidAt,
  onPaidAtChange,
  errors,
  disabled,
}: InlineCostFieldsProps): React.ReactElement | null {
  if (hasMultipleCosts) return null;

  // Ticking Paid pre-fills the amount with the cost, so confirming a thing that
  // cost what you expected is one gesture — that pre-fill is what keeps the
  // "paid needs an amount" rule (ADR 0037) from being friction.
  function handlePaidToggle(next: boolean) {
    onPaidChange(next);
    if (next) {
      if (!paidAmount.trim() && costAmount.trim()) onPaidAmountChange(costAmount);
      if (!paidAt.trim()) onPaidAtChange(todayLocalISO());
    }
  }

  return (
    <>
      <Field
        label="Cost"
        description="Your best number — the real price if it's already booked."
        error={errors.costMinor?.[0]}
      >
        <MoneyInput
          amount={costAmount}
          currency={currency}
          currencies={CURRENCY_CODES}
          onAmountChange={onCostChange}
          onCurrencyChange={onCurrencyChange}
          disabled={disabled}
          invalid={Boolean(errors.costMinor)}
          aria-label="Cost amount"
        />
      </Field>

      {costAmount.trim() && (
        <>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={paid}
              onChange={(e) => handlePaidToggle(e.target.checked)}
              disabled={disabled}
              className="size-4 rounded border-input accent-primary"
            />
            Paid
          </label>

          {paid && (
            <>
              <Field label="You paid" error={errors.paidMinor?.[0]}>
                <MoneyInput
                  amount={paidAmount}
                  currency={currency}
                  currencies={CURRENCY_CODES}
                  onAmountChange={onPaidAmountChange}
                  onCurrencyChange={onCurrencyChange}
                  disabled={disabled}
                  invalid={Boolean(errors.paidMinor)}
                  aria-label="You paid amount"
                />
              </Field>

              <Field label="Date paid" error={errors.paidAt?.[0]}>
                <Input
                  type="date"
                  value={paidAt}
                  onChange={(e) => onPaidAtChange(e.target.value)}
                  disabled={disabled}
                />
              </Field>
            </>
          )}
        </>
      )}
    </>
  );
}
