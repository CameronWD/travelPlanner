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
import type { ActionFailure } from "@/lib/action-result";
import type { CostRawInput } from "@/lib/validations/cost";
import { paidFieldsFromRow } from "@/lib/money/cost-form-state";
import { patched, type Patch } from "@/lib/patch";

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
export function mergeCostPatch(current: CostPatchRow, patch: Patch<CostRawInput>): CostRawInput | ActionFailure {
  const paid = paidPairAfter({ paidMinor: patch.paidMinor, paidAt: patch.paidAt as string | null | undefined }, current);
  const settlement = (patch.settlement ?? current.settlement) as CostRawInput["settlement"];
  const noDueDate = paid.paidAt !== undefined || settlement === "ON_TRIP";
  if (noDueDate && patch.dueDate != null) return DUE_DATE_NOT_APPLICABLE;
  return {
    costMinor: patch.costMinor ?? current.costMinor,
    currency: patch.currency ?? current.currency,
    ownerType: (patch.ownerType ?? current.ownerType) as CostRawInput["ownerType"],
    ownerId: patched(patch.ownerId, current.ownerId),
    label: patched(patch.label, current.label),
    category: patched(patch.category, current.category),
    dueDate: noDueDate ? undefined : patched(patch.dueDate, current.dueDate),
    settlement,
    ...paid,
  };
}

/** The owned-Cost columns an update loads to complete its inline Cost. */
export const OWNED_COST_SELECT = { id: true, costMinor: true, currency: true, paidMinor: true, paidAt: true } as const;

export type OwnedCostRow = { id: string; costMinor: number; currency: string; paidMinor: number | null; paidAt: Date | null };
export type InlineCostPatch = {
  costMinor?: number | null;
  currency?: string | null;
  paidMinor?: number | null;
  paidAt?: string | null;
  settlement?: "BEFORE" | "ON_TRIP" | null;
};
export type InlineCost = { costMinor: number; currency: string; paidMinor?: number; paidAt?: string; settlement?: "BEFORE" | "ON_TRIP" };

const MORE_THAN_ONE_COST: ActionFailure = {
  success: false,
  errors: { costMinor: ["This has more than one Cost already. Use update_cost to edit a specific one."] },
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
export function completeInlineCost(patch: InlineCostPatch, owned: readonly OwnedCostRow[]): InlineCost | ActionFailure | null {
  if (patch.costMinor == null && patch.currency == null) return null;
  if (owned.length > 1) return MORE_THAN_ONE_COST;
  const single = owned[0] ?? null;
  const costMinor = patch.costMinor ?? single?.costMinor;
  const currency = patch.currency ?? single?.currency;
  if (costMinor === undefined || currency === undefined) return BOTH_HALVES;
  return {
    costMinor,
    currency,
    ...paidPairAfter(patch, single),
    ...(patch.settlement != null ? { settlement: patch.settlement } : {}),
  };
}
