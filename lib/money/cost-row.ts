/**
 * Shape of a cost row as rendered by the entity cards. Pages fetch costs
 * inline via `db.cost.findMany` (after `requireTripAccess`) and pass rows
 * matching this shape to the cards. A plain type in lib (spec 2026-10-14
 * card 3.N) so lib loaders and the cost form state don't import a
 * "use server" module for it.
 */
export type CostRow = {
  id: string;
  costMinor: number;
  paidMinor: number | null;
  currency: string;
  rateToHome: number | null;
  paidAt: Date | null;
  dueDate: string | null;
  ownerType: string;
  ownerId: string | null;
  label: string | null;
  category: string | null;
  /** CONTEXT.md "Settlement" — BEFORE | ON_TRIP; anything else reads as BEFORE. */
  settlement: string;
};
