/**
 * The pure half of Apply and Undo (spec 2026-10-17 R8): which row a fix
 * touches, a snapshot of the fields it touches (taken before and after
 * Apply, stored as the Finding's undoPayload; a checklist fix stores what
 * it added or marked instead, spec 2026-10-18 A2), and the copy the actions
 * return. server/actions/reviews.ts runs the actions themselves.
 */
import { z } from "zod";
import { suggestedFixSchema } from "@/lib/review/schema";
import { isChecklistFix, type ChecklistFix, type RowFix, type SuggestedFix } from "@/lib/review/types";

export type FixTarget = { kind: "item" | "transport" | "accommodation"; id: string };

export function fixTarget(fix: RowFix): FixTarget {
  switch (fix.kind) {
    case "item.times":
    case "item.openingHours":
    case "item.note":
      return { kind: "item", id: fix.itemId };
    case "item.bookingState":
      return { kind: "item", id: fix.id };
    case "transport.bookingState":
      return { kind: "transport", id: fix.id };
    case "accommodation.bookingState":
      return { kind: "accommodation", id: fix.id };
  }
}

const TARGET_TYPE: Record<FixTarget["kind"], "ITEM" | "TRANSPORT" | "ACCOMMODATION"> = {
  item: "ITEM",
  transport: "TRANSPORT",
  accommodation: "ACCOMMODATION",
};

/**
 * A fix only ever changes its Finding's own row (lib/review/model-output.ts
 * toSuggestedFix) — except a checklist fix, which adds to a list: same type,
 * same id. A TRIP or DAY Finding has no row, so no row fix fits it, but a
 * checklist fix fits any Finding, the Trip included. Reads and Apply treat a
 * stored fix that doesn't fit as none.
 */
export function fixFitsTarget(fix: SuggestedFix, finding: { targetType: string; targetId: string | null }): boolean {
  if (isChecklistFix(fix)) return true;
  const target = fixTarget(fix);
  return TARGET_TYPE[target.kind] === finding.targetType && target.id === finding.targetId;
}

/** The columns a fix can touch, as read from the Item, Transport or Accommodation row. */
export interface FixRow {
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
  openingHours?: string | null;
  bookingState?: string;
  bookingStateSet?: boolean;
  bookBy?: string | null;
}

const snapshotSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("times"), date: z.string().nullable(), startTime: z.string().nullable(), endTime: z.string().nullable() }),
  z.strictObject({ kind: z.literal("booking"), bookingState: z.string(), bookingStateSet: z.boolean(), bookBy: z.string().nullable() }),
  z.strictObject({ kind: z.literal("openingHours"), openingHours: z.string().nullable() }),
  z.strictObject({ kind: z.literal("note"), notes: z.string().nullable() }),
]);
export type FixSnapshot = z.infer<typeof snapshotSchema>;

export function snapshotFor(fix: RowFix, row: FixRow): FixSnapshot {
  switch (fix.kind) {
    case "item.times":
      return { kind: "times", date: row.date ?? null, startTime: row.startTime ?? null, endTime: row.endTime ?? null };
    case "item.openingHours":
      return { kind: "openingHours", openingHours: row.openingHours ?? null };
    case "item.note":
      return { kind: "note", notes: row.notes ?? null };
    case "item.bookingState":
    case "transport.bookingState":
    case "accommodation.bookingState":
      return { kind: "booking", bookingState: row.bookingState ?? "", bookingStateSet: row.bookingStateSet ?? false, bookBy: row.bookBy ?? null };
  }
}

export function sameSnapshot(a: FixSnapshot, b: FixSnapshot): boolean {
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  return [...keys].every((k) => ra[k] === rb[k]);
}

/** An `item.note` fix adds its text as a paragraph of its own. */
export function appendedNote(notes: string | null, append: string): string {
  const current = notes?.trimEnd() ?? "";
  return current.trim() ? `${current}\n\n${append}` : append;
}

/** A row fix's Undo: the touched fields before and after Apply. */
export interface RowUndoPayload {
  fix: RowFix;
  before: FixSnapshot;
  after: FixSnapshot;
}

/** A checklist fix's Undo (spec 2026-10-18 A2). */
export interface ChecklistUndoPayload {
  fix: ChecklistFix;
  /** What Apply did: added a new entry, marked an existing Packing entry Need to buy, or nothing (already there). */
  done: "added" | "marked" | "none";
  itemId: string | null;
  /** The entry as Apply left it, so Undo never overwrites a later tick or edit. */
  after: { text: string; done: boolean; buy: string | null } | null;
}

export type UndoPayload = RowUndoPayload | ChecklistUndoPayload;

const rowUndoPayloadSchema = z.strictObject({
  fix: suggestedFixSchema.refine((fix) => !isChecklistFix(fix)),
  before: snapshotSchema,
  after: snapshotSchema,
});
const checklistUndoPayloadSchema = z.strictObject({
  fix: suggestedFixSchema.refine(isChecklistFix),
  done: z.enum(["added", "marked", "none"]),
  itemId: z.string().nullable(),
  after: z.strictObject({ text: z.string(), done: z.boolean(), buy: z.string().nullable() }).nullable(),
});
const undoPayloadSchema = z.union([rowUndoPayloadSchema, checklistUndoPayloadSchema]);

export function parseUndoPayload(raw: string | null | undefined): UndoPayload | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = undoPayloadSchema.safeParse(json);
  // The refinements split `fix` by kind, which zod's types can't express.
  return parsed.success ? (parsed.data as UndoPayload) : null;
}

/**
 * An Apply claims its Finding (APPLIED, no undoPayload yet) before it runs the
 * action and saves the payload after. A claim older than this never finished
 * (a timeout killed the request), so Undo releases it back to OPEN.
 */
const APPLY_STALE_AFTER_MS = 5 * 60_000;

/** An APPLIED Finding whose Apply never saved its payload, and never will. */
export function isStrandedApply(f: { state: string; undoPayload: string | null; stateAt: Date | null }, now: Date): boolean {
  return f.state === "APPLIED" && f.undoPayload === null && (f.stateAt === null || now.getTime() - f.stateAt.getTime() > APPLY_STALE_AFTER_MS);
}

/** Form-level refusals of Apply, Dismiss and Undo (server/actions/reviews.ts). */
export const REVIEW_ACTION_COPY = {
  handled: "Someone has already dealt with this one.",
  replaced: "A newer Review has replaced this one.",
  noFix: "There's no fix to apply for this one. Dismiss it instead.",
  gone: "That's no longer in the plan, so this can't be applied.",
  goneUndo: "That's no longer in the plan, so there's nothing to undo.",
  changed: "That has been changed since, so Undo would overwrite it. Change it in the plan instead.",
  applying: "This is still being applied. Try again in a moment.",
  nothing: "There's nothing to undo here.",
} as const;
