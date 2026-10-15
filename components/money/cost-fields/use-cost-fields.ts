"use client";

import * as React from "react";
import { todayLocalISO } from "@/lib/dates";
import type { CostSettlement } from "@/lib/enum-values";
import { setCostAmount, setPaid, toCostPayload, type CostFormState, type CostPayload } from "./cost-form-state";
import type { InlineCostFieldsProps } from "./inline-cost-fields";

export type CostFieldProps = Pick<
  InlineCostFieldsProps,
  | "costAmount"
  | "onCostChange"
  | "currency"
  | "onCurrencyChange"
  | "paid"
  | "onPaidChange"
  | "paidAmount"
  | "onPaidAmountChange"
  | "paidAt"
  | "onPaidAtChange"
  | "settlement"
  | "onSettlementChange"
>;

/**
 * One inline Cost's state for an entity form (card 2.I): seeded once, edited
 * through `fieldProps` (spread onto `<InlineCostFields>`), turned into the
 * action's Cost fields by `payload()`. The rules live in `cost-form-state.ts`.
 */
export function useCostFields(seed: CostFormState): {
  state: CostFormState;
  fieldProps: CostFieldProps;
  payload(): CostPayload;
  dirtyValues: readonly unknown[];
} {
  const [state, setState] = React.useState<CostFormState>(seed);

  const fieldProps: CostFieldProps = {
    costAmount: state.costAmount,
    onCostChange: (v: string) => setState((s) => setCostAmount(s, v)),
    currency: state.currency,
    onCurrencyChange: (v: string) => setState((s) => ({ ...s, currency: v })),
    paid: state.paid,
    onPaidChange: (v: boolean) => setState((s) => setPaid(s, v, todayLocalISO())),
    paidAmount: state.paidAmount,
    onPaidAmountChange: (v: string) => setState((s) => ({ ...s, paidAmount: v })),
    paidAt: state.paidAt,
    onPaidAtChange: (v: string) => setState((s) => ({ ...s, paidAt: v })),
    settlement: state.settlement,
    onSettlementChange: (v: CostSettlement) => setState((s) => ({ ...s, settlement: v })),
  };

  return {
    state,
    fieldProps,
    payload: () => toCostPayload(state),
    dirtyValues: [state.costAmount, state.currency, state.paid, state.paidAmount, state.paidAt, state.settlement],
  };
}
