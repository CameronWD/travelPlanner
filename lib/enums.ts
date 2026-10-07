import { z } from "zod";
import {
  TRANSPORT_MODES,
  COST_OWNER_TYPES,
  COST_SETTLEMENTS,
  VOTE_LEVELS,
  CHECKLIST_KINDS,
  BUY_STATES,
  MEMBER_ROLES,
  TARGET_TYPES,
} from "./enum-values";

/**
 * Zod schemas for the "enum-ish" string columns (validated in app code, not
 * Prisma enums). Server-side only — client code imports the plain values
 * from `lib/enum-values.ts` (spec 2026-10-06 §R; lib/enum-values.guard.test.ts).
 */
export * from "./enum-values";

export const transportModeSchema = z.enum(TRANSPORT_MODES);
export const costOwnerTypeSchema = z.enum(COST_OWNER_TYPES);
export const costSettlementSchema = z.enum(COST_SETTLEMENTS);
export const voteLevelSchema = z.enum(VOTE_LEVELS);
export const checklistKindSchema = z.enum(CHECKLIST_KINDS);
export const buyStateSchema = z.enum(BUY_STATES);
export const memberRoleSchema = z.enum(MEMBER_ROLES);
export const targetTypeSchema = z.enum(TARGET_TYPES);
