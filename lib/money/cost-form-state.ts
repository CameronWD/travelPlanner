/**
 * One Cost form's state (card 2.I): the shared shape behind every Cost
 * dialog — CostEditor's `OwnedCostFormDialog`/Add·Edit dialogs,
 * OtherCostEditor, and the three entity forms' inline Cost fields
 * (InlineCostFields). Replaces `components/trip/cost-seed.ts`'s `seedCost`
 * plus the per-form `costToFormState`/`parseOwnedFormToInput`/
 * `parseFormToInput` copies.
 *
 * Pure (no React, no Prisma) so it's trivially testable; `components/trip`'s
 * dialogs call into this for seeding and payload-building (Tasks 11-12).
 *
 * Rules (ADR 0037, CONTEXT.md "Paid"):
 *  - `paidAt` is the only "is paid" signal — a legacy row with a paid amount
 *    but no paid date opens with Paid unticked, and the amount survives as
 *    history (`costToFormState`, `other-cost-editor.test.tsx:199-215`).
 *  - A payload's paid fields are `undefined`, never `null` — `costSchema`'s
 *    `paidMinor`/`paidAt` are `.optional()`, not `.nullable()`.
 *  - `settlement` is always sent (a plain choice, never derived from dates).
 *  - Ticking Paid pre-fills the paid amount from the cost (if blank) and the
 *    paid date with today (if blank) — confirming something that cost what
 *    you expected is one gesture.
 */
import { isOnTrip } from "@/lib/enum-values";
import type { CostSettlement } from "@/lib/enum-values";
import { formatMinor, parseAmountToMinor } from "@/lib/money";
import type { ProposalCostFields } from "@/lib/booking-import/types";
import type { FieldErrors } from "@/lib/action-result";
import type { CostRow } from "@/lib/money/cost-row";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostFormState {
  costAmount: string;
  currency: string;
  paid: boolean;
  paidAmount: string;
  paidAt: string;
  /** CONTEXT.md "Settlement". */
  settlement: CostSettlement;
}

type CostPayloadFields = {
  costMinor: number;
  currency: string;
  paidMinor?: number;
  paidAt?: string;
  settlement: CostSettlement;
};

export type CostPayload =
  | { kind: "none" } // cost amount blank
  | { kind: "invalid"; errors: FieldErrors } // { costMinor: ["Enter the cost"] } or { paidMinor: ["Enter what you paid"] }
  | { kind: "ok"; fields: CostPayloadFields };

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** An empty Cost in the given (default) currency, unpaid, Before you go. */
export function emptyCostFormState(currency: string): CostFormState {
  return { costAmount: "", currency, paid: false, paidAmount: "", paidAt: "", settlement: "BEFORE" };
}

/** Seed from a saved single Cost row. */
export function costToFormState(row: CostRow): CostFormState {
  return {
    costAmount: formatMinor(row.costMinor, row.currency),
    currency: row.currency,
    // `paidAt` is the sole "is this paid" signal (CONTEXT.md "Paid") — a
    // legacy row with a paid amount but no date is NOT paid, and must open
    // with the box unticked so re-saving it doesn't fabricate a payment.
    paid: Boolean(row.paidAt),
    // A legacy paid row with no recorded amount opens with the cost as its
    // paid amount (`paidFieldsFromRow`'s fallback) — otherwise it would
    // open Paid-with-a-blank-amount and refuse to save.
    paidAmount:
      row.paidMinor !== null && row.paidMinor !== undefined
        ? formatMinor(row.paidMinor, row.currency)
        : row.paidAt
          ? formatMinor(row.costMinor, row.currency)
          : "",
    paidAt: row.paidAt ? new Date(row.paidAt).toISOString().slice(0, 10) : "",
    settlement: isOnTrip(row.settlement) ? "ON_TRIP" : "BEFORE",
  };
}

/** Seed from a Booking import Proposal's inline Cost fields. */
function proposalToFormState(p: ProposalCostFields, defaultCurrency: string): CostFormState {
  const currency = p.currency ?? defaultCurrency;
  return {
    costAmount: p.costMinor !== undefined ? formatMinor(p.costMinor, currency) : "",
    currency,
    paidAmount: p.paidMinor != null ? formatMinor(p.paidMinor, currency) : "",
    paidAt: p.paidAt ?? "",
    paid: Boolean(p.paidAt),
    settlement: p.settlement ?? "BEFORE",
  };
}

/** The inline Cost fields' first values: a saved single Cost, else a Proposal's Cost, else empty. */
export function seedCostFormState(
  single: CostRow | null,
  proposed: ProposalCostFields | undefined,
  defaultCurrency: string,
): CostFormState {
  if (single) return costToFormState(single);
  if (proposed?.costMinor !== undefined && proposed.currency) return proposalToFormState(proposed, defaultCurrency);
  return emptyCostFormState(defaultCurrency);
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

/**
 * Edit the cost amount. Blanking it clears the paid state too — otherwise it
 * would persist invisibly, and a blank cost could save alongside a stale
 * paid amount.
 */
export function setCostAmount<S extends CostFormState>(s: S, value: string): S {
  return {
    ...s,
    costAmount: value,
    ...(value.trim() === "" ? { paid: false, paidAmount: "", paidAt: "" } : {}),
  };
}

/**
 * Toggle Paid. Ticking it pre-fills the paid amount with the cost (when
 * blank) and the paid date with `today` (when blank) — confirming a thing
 * that cost what you expected is one gesture (ADR 0037). Unticking leaves
 * the amount/date as-is so re-ticking doesn't lose them.
 */
export function setPaid<S extends CostFormState>(s: S, next: boolean, today: string): S {
  if (!next) return { ...s, paid: false };
  return {
    ...s,
    paid: true,
    paidAmount: !s.paidAmount.trim() && s.costAmount.trim() ? s.costAmount : s.paidAmount,
    paidAt: !s.paidAt.trim() ? today : s.paidAt,
  };
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

/**
 * Build the server action's payload fields from the form state, or an
 * `invalid`/`none` result when it can't. A blank cost amount is `none` (the
 * caller's own "required" error, e.g. standalone forms with no inline
 * Cost); a non-blank but unparseable cost amount is `invalid` — it is never
 * silently dropped (card 2.I: a typed cost that fails to parse must surface
 * "Enter the cost", not save without it).
 */
export function toCostPayload(s: CostFormState): CostPayload {
  if (s.costAmount.trim() === "") return { kind: "none" };

  const costMinor = parseAmountToMinor(s.costAmount, s.currency);
  if (costMinor === null) return { kind: "invalid", errors: { costMinor: ["Enter the cost"] } };

  if (!s.paid) {
    return {
      kind: "ok",
      fields: { costMinor, currency: s.currency, paidMinor: undefined, paidAt: undefined, settlement: s.settlement },
    };
  }

  // The invariant is one-directional (ADR 0037): a paid *date* requires an
  // amount, but an amount with no date is a legal, incomplete record — so a
  // blank/unparseable paid amount is refused outright, while a blank paid
  // date is simply omitted (never fabricated).
  const paidMinor = parseAmountToMinor(s.paidAmount, s.currency);
  if (paidMinor === null) return { kind: "invalid", errors: { paidMinor: ["Enter what you paid"] } };

  return {
    kind: "ok",
    fields: { costMinor, currency: s.currency, paidMinor, paidAt: s.paidAt || undefined, settlement: s.settlement },
  };
}

/**
 * The paid pair to resend for a saved Cost row whose paid state isn't
 * changing (e.g. a PATCH that must not silently un-pay it) — `paidAt`
 * decides; unpaid sends neither field, and a paid row with no recorded
 * amount falls back to the cost amount (PaidConfirm's pre-fill, same
 * reasoning: an un-ticked payment's preserved amount is the best answer to
 * "how much did I pay?").
 */
export function paidFieldsFromRow(row: {
  costMinor: number;
  paidMinor: number | null;
  paidAt: Date | string | null;
}): { paidMinor?: number; paidAt?: string } {
  if (!row.paidAt) return {};
  return { paidMinor: row.paidMinor ?? row.costMinor, paidAt: new Date(row.paidAt).toISOString().slice(0, 10) };
}
