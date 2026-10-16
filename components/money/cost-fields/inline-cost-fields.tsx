"use client";

import * as React from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { CURRENCY_CODES } from "@/lib/money/currencies";
import type { FieldErrors } from "@/lib/action-result";
import type { CostSettlement } from "@/lib/enum-values";
import { SettlementChoice } from "@/components/trip/settlement-choice";

export interface InlineCostFieldsProps {
  /** When true the CostEditor is authoritative — render nothing here. */
  hasMultipleCosts: boolean;
  costAmount: string;
  onCostChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  paid: boolean;
  /**
   * Ticking Paid should pre-fill the paid amount and date — pass
   * `setPaid` from `lib/money/cost-form-state.ts` (`useCostFields` does).
   */
  onPaidChange: (v: boolean) => void;
  paidAmount: string;
  onPaidAmountChange: (v: string) => void;
  paidAt: string;
  onPaidAtChange: (v: string) => void;
  /**
   * CONTEXT.md "Settlement" — BEFORE (Before you go) or ON_TRIP (On the
   * trip). Anything else shows as Before you go.
   */
  settlement: string;
  onSettlementChange: (v: CostSettlement) => void;
  errors: FieldErrors;
  disabled?: boolean;
  /**
   * The wide entity dialogs (spec 2026-10-05 §D): from sm, Cost sits beside
   * the Settlement and Paid, and You paid beside Date paid. Off (CostEditor),
   * the fields stay one flat column.
   */
  paired?: boolean;
}

const PAIR = "grid gap-x-4 gap-y-[inherit] sm:grid-cols-2";

/**
 * The inline single-cost editor (cost + paid toggle) shared by the
 * transport / accommodation / item form dialogs and the CostEditor. Ticking
 * Paid reveals the paid amount and date (the pre-fill is the state's job:
 * `setPaid`, ADR 0037). Hidden entirely when >1 costs exist.
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
  settlement,
  onSettlementChange,
  errors,
  disabled,
  paired = false,
}: InlineCostFieldsProps): React.ReactElement | null {
  if (hasMultipleCosts) return null;

  const costField = (
    <Field
      label="Cost"
      description="Your best number: the real price if it's already booked."
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
  );

  const hasCost = Boolean(costAmount.trim());

  const settleAndPaid = hasCost ? (
    <>
      {/* Settlement — a plain choice, never derived from dates. */}
      <SettlementChoice value={settlement} onChange={onSettlementChange} disabled={disabled} />

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={paid}
          onChange={(e) => onPaidChange(e.target.checked)}
          disabled={disabled}
          className="size-4 rounded border-input accent-primary"
        />
        Paid
      </label>
    </>
  ) : null;

  const paidFields =
    hasCost && paid ? (
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
          <Input type="date" value={paidAt} onChange={(e) => onPaidAtChange(e.target.value)} disabled={disabled} />
        </Field>
      </>
    ) : null;

  if (!paired) {
    return (
      <>
        {costField}
        {settleAndPaid}
        {paidFields}
      </>
    );
  }

  // Row gaps inherit the parent's, so below sm this is the flat column above.
  return (
    <>
      <div data-pair="cost" className={PAIR}>
        {costField}
        {settleAndPaid && <div className="flex flex-col gap-y-[inherit] sm:pt-7">{settleAndPaid}</div>}
      </div>
      {paidFields && (
        <div data-pair="paid" className={PAIR}>
          {paidFields}
        </div>
      )}
    </>
  );
}
