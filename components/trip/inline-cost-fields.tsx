"use client";

import * as React from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { CURRENCY_CODES } from "@/lib/currencies";
import type { FieldErrors } from "@/lib/action-result";

export interface InlineCostFieldsProps {
  /** When true the CostEditor is authoritative — render nothing here. */
  hasMultipleCosts: boolean;
  estimatedAmount: string;
  onEstimatedChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  actualAmount: string;
  onActualChange: (v: string) => void;
  paidAt: string;
  onPaidAtChange: (v: string) => void;
  errors: FieldErrors;
  disabled?: boolean;
}

/**
 * The inline single-cost editor (estimated + actual + date-paid) shared by the
 * transport / accommodation / item form dialogs. Actual + paid only appear once
 * an estimate is entered. Hidden entirely when >1 costs exist.
 */
export function InlineCostFields({
  hasMultipleCosts,
  estimatedAmount,
  onEstimatedChange,
  currency,
  onCurrencyChange,
  actualAmount,
  onActualChange,
  paidAt,
  onPaidAtChange,
  errors,
  disabled,
}: InlineCostFieldsProps): React.ReactElement | null {
  if (hasMultipleCosts) return null;
  return (
    <>
      <Field label="Estimated cost" error={errors.estimatedMinor?.[0]}>
        <MoneyInput
          amount={estimatedAmount}
          currency={currency}
          currencies={CURRENCY_CODES}
          onAmountChange={onEstimatedChange}
          onCurrencyChange={onCurrencyChange}
          disabled={disabled}
          invalid={Boolean(errors.estimatedMinor)}
          aria-label="Estimated cost amount"
        />
      </Field>

      {estimatedAmount.trim() && (
        <>
          <Field
            label="Actual cost"
            description="Leave blank if you haven't paid yet"
            error={errors.actualMinor?.[0]}
          >
            <MoneyInput
              amount={actualAmount}
              currency={currency}
              currencies={CURRENCY_CODES}
              onAmountChange={onActualChange}
              onCurrencyChange={onCurrencyChange}
              disabled={disabled}
              invalid={Boolean(errors.actualMinor)}
              aria-label="Actual cost amount"
            />
          </Field>

          <Field
            label="Date paid"
            description="Optional — when the cost was paid"
            error={errors.paidAt?.[0]}
          >
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
  );
}
