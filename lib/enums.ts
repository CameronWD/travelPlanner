import { z } from "zod";

/**
 * Shared allowed-value lists for the domain's "enum-ish" string columns.
 *
 * We deliberately avoid Prisma `enum` and store these as plain `String` columns
 * to keep the schema portable across database providers, validating the allowed
 * values in app code with the Zod unions exported here. Keeping the constants
 * here means UI, server actions, and the schema all agree.
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
export const transportModeSchema = z.enum(TRANSPORT_MODES);

/** `Cost.ownerType` — what a cost is attached to (OTHER = standalone). */
export const COST_OWNER_TYPES = [
  "TRANSPORT",
  "ACCOMMODATION",
  "ITEM",
  "OTHER",
] as const;
export type CostOwnerType = (typeof COST_OWNER_TYPES)[number];
export const costOwnerTypeSchema = z.enum(COST_OWNER_TYPES);

/** `Vote.level` — wishlist enthusiasm. */
export const VOTE_LEVELS = ["MUST", "KEEN", "MEH"] as const;
export type VoteLevel = (typeof VOTE_LEVELS)[number];
export const voteLevelSchema = z.enum(VOTE_LEVELS);

/** `ChecklistItem.kind` */
export const CHECKLIST_KINDS = ["PRETRIP", "PACKING"] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];
export const checklistKindSchema = z.enum(CHECKLIST_KINDS);

/** `TripMember.role` / `Invite.role` */
export const MEMBER_ROLES = ["owner", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
export const memberRoleSchema = z.enum(MEMBER_ROLES);

/** `Note.targetType` / `Attachment.targetType` — what a note/file points at. */
export const TARGET_TYPES = [
  "TRIP",
  "STOP",
  "ITEM",
  "TRANSPORT",
  "ACCOMMODATION",
  "JOURNAL",
] as const;
export type TargetType = (typeof TARGET_TYPES)[number];
export const targetTypeSchema = z.enum(TARGET_TYPES);
