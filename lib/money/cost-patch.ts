/**
 * A Cost's PATCH rules (ADR 0075, spec 2026-10-14 card 3.L): what a partial
 * update keeps, for the standalone Cost (`updateCost`) and for the inline
 * Cost an Accommodation, Transport or thing to do owns (`completeInlineCost`).
 *
 * The paid pair (CONTEXT.md "Paid", ADR 0037): a patch that says anything
 * about paid (`paidMinor` or `paidAt` given, `null` included) is taken as
 * said — the editors always say it; a patch that says nothing keeps the
 * row's pair, `paidAt` deciding (`paidFieldsFromRow`). A paid amount left
 * undefined is left alone by the action, so an un-paid Cost keeps it as
 * history.
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

/** The paid pair after a patch: the patch's own when it says anything about paid, else the row's. */
export function paidPairAfter(
  patch: { paidMinor?: number | null; paidAt?: string | null },
  row: { costMinor: number; paidMinor: number | null; paidAt: Date | string | null } | null,
): { paidMinor?: number; paidAt?: string } {
  if (patch.paidMinor !== undefined || patch.paidAt !== undefined) {
    return {
      ...(patch.paidMinor != null ? { paidMinor: patch.paidMinor } : {}),
      ...(patch.paidAt != null ? { paidAt: patch.paidAt } : {}),
    };
  }
  return row ? paidFieldsFromRow(row) : {};
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
