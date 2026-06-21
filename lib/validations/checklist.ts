import { z } from "zod";
import { checklistKindSchema } from "@/lib/enums";

/** YYYY-MM-DD regex */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

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
    .max(200, "Text must be 200 characters or fewer"),
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
export type ChecklistItemOutput = z.output<typeof checklistItemSchema>;

/**
 * Schema for updating (partial) a ChecklistItem — kind is not editable
 * after creation.
 */
export const checklistItemUpdateSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Text is required")
    .max(200, "Text must be 200 characters or fewer")
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
export type ChecklistItemUpdateOutput = z.output<typeof checklistItemUpdateSchema>;

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

export type TemplateInput = z.input<typeof templateSchema>;
export type TemplateOutput = z.output<typeof templateSchema>;
