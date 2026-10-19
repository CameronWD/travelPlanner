import { z } from "zod";
import { checklistKindSchema } from "@/lib/enums";
import { isoDate } from "@/lib/validations/primitives";

/** The longest text a ChecklistItem's own `text` may hold. Also the limit for a Review's `checklist.add` fix (lib/review/schema.ts): the same field, written through a different door. */
export const CHECKLIST_TEXT_MAX = 200;

/**
 * Schema for creating or updating a ChecklistItem.
 *
 * - kind: "PRETRIP" | "PACKING"
 * - text: non-empty, trimmed, max 200 chars
 * - dueDate: optional YYYY-MM-DD string
 * - assignedToId: optional user id
 */
export const checklistItemSchema = z.object({
  kind: checklistKindSchema,
  text: z
    .string()
    .trim()
    .min(1, "Text is required")
    .max(CHECKLIST_TEXT_MAX, `Text must be ${CHECKLIST_TEXT_MAX} characters or fewer`),
  dueDate: z
    .union([isoDate, z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  assignedToId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type ChecklistItemInput = z.input<typeof checklistItemSchema>;

/**
 * A single text in a bulk add (addChecklistItems — e.g. AI packing "Add
 * all"). Same trim + max-length rule as checklistItemSchema's `text`, but
 * NOT `.min(1)`: a blank is a candidate for the caller to silently drop,
 * not a validation failure for the whole batch.
 */
const checklistItemTextSchema = z
  .string()
  .trim()
  .max(CHECKLIST_TEXT_MAX, `Text must be ${CHECKLIST_TEXT_MAX} characters or fewer`);

/**
 * Schema for addChecklistItems — bulk-adding ChecklistItems in one write
 * with one Activity line, instead of one addChecklistItem call per item.
 */
export const checklistItemsSchema = z.object({
  kind: checklistKindSchema,
  texts: z.array(checklistItemTextSchema),
});

/**
 * Schema for updating (partial) a ChecklistItem — kind is not editable
 * after creation.
 */
export const checklistItemUpdateSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Text is required")
    .max(CHECKLIST_TEXT_MAX, `Text must be ${CHECKLIST_TEXT_MAX} characters or fewer`)
    .optional(),
  // On update, an omitted field (undefined) means "leave unchanged"; an empty
  // string is an explicit "clear this field" and maps to null.
  dueDate: z
    .union([isoDate, z.literal("")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  assignedToId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
});

export type ChecklistItemUpdateInput = z.input<typeof checklistItemUpdateSchema>;

/**
 * Schema for a packing template name.
 */
export const templateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name must be 80 characters or fewer"),
});
