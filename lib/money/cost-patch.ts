/**
 * A Cost's PATCH rules (ADR 0075, spec 2026-10-14 card 3.L): what a partial
 * update keeps, for the standalone Cost (`updateCost`) and for the inline
 * Cost an Accommodation, Transport or thing to do owns (`completeInlineCost`).
 *
 * The paid pair (CONTEXT.md "Paid", ADR 0037): `paidAt` alone decides
 * whether a patch speaks about Paid. A patch that gives `paidAt` (`null`
 * included) is taken as said — the editors always say it; a patch that
 * doesn't keeps the row's pair (`paidFieldsFromRow`), with a lone
 * `paidMinor` overlaid as the new paid amount, so it never un-pays a paid
 * Cost. `paidMinor: null` leaves the stored paid amount (it is history),
 * unlike the general null-clears contract. A paid amount left undefined is
 * left alone by the action, so an un-paid Cost keeps it as history.
 *
 * Pure: no Prisma, no zod (types only).
 */
import { formFail, type ActionFailure } from "@/lib/action-result";
import type { CostRawInput } from "@/lib/validations/cost";
import { paidFieldsFromRow } from "@/lib/money/cost-form-state";
import { patched, type Patch } from "@/lib/patch";
import { formatISODate } from "@/lib/dates";
import { refundProblem, REFUND_MESSAGES } from "@/lib/money/refund";
import { followCurrencyChange, paidCurrencyOf, storedPaidCurrency, type PaidCurrencyFields } from "@/lib/money/paid-currency";

export type CostPatchRow = {
  costMinor: number;
  currency: string;
  paidMinor: number | null;
  paidAt: Date | string | null;
  dueDate: string | null;
  ownerType: string;
  ownerId: string | null;
  label: string | null;
  category: string | null;
  settlement: string;
  refundMinor?: number | null;
  refundedAt?: Date | string | null;
  paidCurrency?: string | null;
};

/** A Due date only belongs to an unpaid Cost paid before the trip (CONTEXT.md "Due date"). */
export const DUE_DATE_NOT_APPLICABLE: ActionFailure = {
  success: false,
  errors: {
    dueDate: ["A due date only applies to an unpaid cost paid before the trip. Mark it unpaid or change settlement first, or leave dueDate out."],
  },
};

/**
 * The paid pair after a patch: the patch's own when it gives `paidAt`, else
 * the row's with a lone `paidMinor` overlaid (`null` keeps the row's amount).
 */
export function paidPairAfter(
  patch: { paidMinor?: number | null; paidAt?: string | null },
  row: { costMinor: number; paidMinor: number | null; paidAt: Date | string | null } | null,
): { paidMinor?: number; paidAt?: string } {
  const paidMinor = patch.paidMinor != null ? { paidMinor: patch.paidMinor } : {};
  if (patch.paidAt !== undefined) {
    return { ...paidMinor, ...(patch.paidAt !== null ? { paidAt: patch.paidAt } : {}) };
  }
  return { ...(row ? paidFieldsFromRow(row) : {}), ...paidMinor };
}

/**
 * Merge a patch onto a standalone Cost. `dueDate` drops out once the Cost
 * reads as paid or its Settlement is On the trip (as the editors do); a
 * Due date the caller *sends* in that state is refused rather than dropped.
 */
export function mergeCostPatch(current: CostPatchRow, patch: Patch<CostRawInput>, homeCurrency?: string | null): CostRawInput | ActionFailure {
  const paid = paidPairAfter({ paidMinor: patch.paidMinor, paidAt: patch.paidAt as string | null | undefined }, current);
  const settlement = (patch.settlement ?? current.settlement) as CostRawInput["settlement"];
  const noDueDate = paid.paidAt !== undefined || settlement === "ON_TRIP";
  if (noDueDate && patch.dueDate != null) return DUE_DATE_NOT_APPLICABLE;
  const currency = patch.currency ?? current.currency;
  const paidCurrency = paidCurrencyAfter(patch, current, currency, patch.paidMinor ?? current.paidMinor, homeCurrency);
  const refund = refundAfter(patch, current);
  const refundBreak = refundGuard({ paidMinor: paid.paidMinor ?? null, paidAt: paid.paidAt }, refund);
  if (refundBreak) return formFail(refundBreak);
  if (refund.refundMinor != null && paidCurrencyMoved(current, { currency, paidCurrency })) return formFail(REFUND_MESSAGES.currencyBlocked);
  return {
    costMinor: patch.costMinor ?? current.costMinor,
    currency,
    ownerType: (patch.ownerType ?? current.ownerType) as CostRawInput["ownerType"],
    ownerId: patched(patch.ownerId, current.ownerId),
    label: patched(patch.label, current.label),
    category: patched(patch.category, current.category),
    dueDate: noDueDate ? undefined : patched(patch.dueDate, current.dueDate),
    settlement,
    ...paid,
    ...refund,
    ...(paidCurrency != null || current.paidCurrency != null ? { paidCurrency } : {}),
  };
}

/**
 * The paid currency to store after a write (null = the Cost's own): the
 * patch's when it names one, else the row's carried across a change of the
 * Cost's currency (`followCurrencyChange`). No paid amount, no paid currency.
 */
function paidCurrencyAfter(
  patch: { paidCurrency?: string | null },
  row: PaidCurrencyFields | null,
  currency: string,
  paidMinor: number | null | undefined,
  homeCurrency: string | null | undefined,
): string | null {
  if (paidMinor == null) return null;
  const next = patch.paidCurrency !== undefined || !row
    ? patch.paidCurrency ?? currency
    : row.paidCurrency == null
      ? currency
      : followCurrencyChange(paidCurrencyOf(row), row.currency, currency, homeCurrency ?? null, true);
  return storedPaidCurrency(next, currency);
}

/** Whether the currency a Cost's paid amount (and so its Refund) is in changes; plain columns, as stored, upper-cased. */
export function paidCurrencyMoved(before: PaidCurrencyFields, after: PaidCurrencyFields): boolean {
  return (before.paidCurrency ?? before.currency) !== (after.paidCurrency ?? after.currency);
}

/** A patch's Refund, else the row's: a Refund survives every edit that does not speak of it. */
function refundAfter(
  patch: { refundMinor?: number | null; refundedAt?: string | Date | null },
  row: { refundMinor?: number | null; refundedAt?: Date | string | null },
): { refundMinor?: number | null; refundedAt?: string | null } {
  const refundMinor = patched(patch.refundMinor, row.refundMinor ?? null);
  const at = patch.refundedAt !== undefined ? patch.refundedAt : row.refundedAt;
  const refundedAt = at == null ? null : formatISODate(new Date(at));
  return {
    ...(refundMinor != null ? { refundMinor } : {}),
    ...(refundedAt != null && refundMinor != null ? { refundedAt } : {}),
  };
}

/**
 * The rule a write would break, given the Cost as it will be afterwards and
 * the Refund it already holds. Un-paying a Cost that holds a Refund gets its
 * own wording; everything else is `refundProblem`'s.
 */
export function refundGuard(
  after: { paidMinor: number | null; paidAt: Date | string | null | undefined },
  stored: { refundMinor?: number | null; refundedAt?: Date | string | null },
): string | null {
  if (stored.refundMinor == null) return null;
  if (after.paidAt == null) return REFUND_MESSAGES.unpayBlocked;
  return refundProblem({ ...after, refundMinor: stored.refundMinor, refundedAt: stored.refundedAt });
}

/** The owned-Cost columns an update loads to complete its inline Cost. */
export const OWNED_COST_SELECT = {
  id: true, costMinor: true, currency: true, paidMinor: true, paidAt: true, refundMinor: true, refundedAt: true, paidCurrency: true,
} as const;

export type OwnedCostRow = {
  id: string; costMinor: number; currency: string; paidMinor: number | null; paidAt: Date | null;
  refundMinor?: number | null; refundedAt?: Date | null; paidCurrency?: string | null;
};
export type InlineCostPatch = {
  costMinor?: number | null;
  currency?: string | null;
  paidMinor?: number | null;
  paidAt?: string | null;
  paidCurrency?: string | null;
  settlement?: "BEFORE" | "ON_TRIP" | null;
};
export type InlineCost = {
  costMinor: number; currency: string; paidMinor?: number; paidAt?: string; paidCurrency?: string | null; settlement?: "BEFORE" | "ON_TRIP";
};

/**
 * Traveller-facing wording only (CONTEXT.md: Cost, Traveller — no "member",
 * no tool name): this refusal can reach the app's Item/Accommodation/
 * Transport dialogs, not just a Claude tool. The MCP write tools
 * (`lib/mcp/tools/bookings-write.ts`) that *do* have an `update_cost` to
 * point at augment this with their own tool-specific sentence rather than
 * this module knowing about tool names.
 */
export const MORE_THAN_ONE_COST: ActionFailure = {
  success: false,
  errors: { costMinor: ["This now has more than one Cost. Edit them in Money."] },
};
const BOTH_HALVES: ActionFailure = {
  success: false,
  errors: { costMinor: ["Pass both costMinor and currency to add or change the Cost, or use add_cost/update_cost."] },
};

/**
 * Completes an update's inline Cost from its owner's Cost rows. `null` when
 * the patch touches neither `costMinor` nor `currency` (the action's "no
 * amount → skip"). With more than one owned Cost the Cost editor is
 * authoritative, so the update is refused rather than half-applied; a lone
 * half with no single Cost to complete it from is refused too. The paid
 * pair follows `paidPairAfter` — the entity forms always say it (an unpaid
 * save sends `paidAt: null`), the Claude tools never do.
 */
export function completeInlineCost(patch: InlineCostPatch, owned: readonly OwnedCostRow[], homeCurrency?: string | null): InlineCost | ActionFailure | null {
  if (patch.costMinor == null && patch.currency == null) return null;
  if (owned.length > 1) return MORE_THAN_ONE_COST;
  const single = owned[0] ?? null;
  const costMinor = patch.costMinor ?? single?.costMinor;
  const currency = patch.currency ?? single?.currency;
  if (costMinor === undefined || currency === undefined) return BOTH_HALVES;
  const paid = paidPairAfter(patch, single);
  const paidCurrency = paidCurrencyAfter(patch, single, currency, patch.paidMinor ?? single?.paidMinor, homeCurrency);
  // The inline write never touches the Refund columns, so it must not leave the Cost breaking the Refund's rules.
  if (single) {
    if (single.refundMinor != null && paidCurrencyMoved(single, { currency, paidCurrency })) return formFail(REFUND_MESSAGES.currencyBlocked);
    const problem = refundGuard(
      { paidMinor: paid.paidMinor ?? single.paidMinor, paidAt: paid.paidAt ?? null },
      single,
    );
    if (problem) return formFail(problem);
  }
  return {
    costMinor,
    currency,
    ...paid,
    ...(paidCurrency != null || single?.paidCurrency != null ? { paidCurrency } : {}),
    ...(patch.settlement != null ? { settlement: patch.settlement } : {}),
  };
}
