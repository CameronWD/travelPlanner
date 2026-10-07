/**
 * Shared allowed-value lists for the domain's "enum-ish" string columns —
 * plain arrays and types, no zod (spec 2026-10-06 §R), so client code can
 * import them without shipping zod. `lib/enums.ts` re-exports these and adds
 * the zod schemas server-side validation uses.
 *
 * We deliberately avoid Prisma `enum` and store these as plain `String`
 * columns to keep the schema portable across database providers.
 */

/** `Transport.mode` */
export const TRANSPORT_MODES = [
  "FLIGHT",
  "TRAIN",
  "BUS",
  "CAR",
  "FERRY",
  "OTHER",
] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

/** `Cost.ownerType` — what a cost is attached to (OTHER = standalone). */
export const COST_OWNER_TYPES = [
  "TRANSPORT",
  "ACCOMMODATION",
  "ITEM",
  "OTHER",
] as const;
export type CostOwnerType = (typeof COST_OWNER_TYPES)[number];

/**
 * `Cost.settlement` — which side of departure a Cost is paid (CONTEXT.md
 * "Settlement"): BEFORE = "Before you go" (the default), ON_TRIP = "On the
 * trip". A plain choice, never derived from dates. A row with any other value
 * (or none — an old build during the migrate window) counts as BEFORE.
 */
export const COST_SETTLEMENTS = ["BEFORE", "ON_TRIP"] as const;
export type CostSettlement = (typeof COST_SETTLEMENTS)[number];

/** Whether a Cost is paid on the trip; anything but ON_TRIP counts as BEFORE. */
export function isOnTrip(settlement: string | null | undefined): boolean {
  return settlement === "ON_TRIP";
}

/** `Vote.level` — wishlist enthusiasm. */
export const VOTE_LEVELS = ["MUST", "KEEN", "MEH"] as const;
export type VoteLevel = (typeof VOTE_LEVELS)[number];

/** `ChecklistItem.kind` */
export const CHECKLIST_KINDS = ["PRETRIP", "PACKING", "SHOPPING"] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

/**
 * `ChecklistItem.buy` — a Packing item's shopping state (spec 2026-10-02 §G,
 * CONTEXT.md "Shopping list"): `null` means nothing to buy, `NEEDED` puts it
 * on the Shopping tab unticked, `BOUGHT` ticks it there. Packing items only.
 */
export const BUY_STATES = ["NEEDED", "BOUGHT"] as const;
export type BuyState = (typeof BUY_STATES)[number];

/** `TripMember.role` / `Invite.role` */
export const MEMBER_ROLES = ["owner", "member"] as const;

/** `Note.targetType` / `Attachment.targetType` — what a note/file points at. */
export const TARGET_TYPES = [
  "TRIP",
  "STOP",
  "ITEM",
  "TRANSPORT",
  "ACCOMMODATION",
  "JOURNAL",
  "MARKER",
] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

/** `FeedbackNote.status` — the lifecycle of a Feedback note (ADR 0040, amended 2026-09-29: NEEDS_REVIEW). */
export const FEEDBACK_STATUSES = ["NEEDS_REVIEW", "OPEN", "DONE", "WONTFIX"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
