import { z } from "zod";
import { targetTypeSchema } from "@/lib/enums";

/**
 * Schema for creating a note.
 * Body is trimmed, non-empty, max 2000 chars.
 */
export const addNoteSchema = z.object({
  targetType: targetTypeSchema,
  targetId: z.string().min(1, "targetId is required"),
  body: z
    .string()
    .trim()
    .min(1, "Note cannot be empty")
    .max(2000, "Note must be 2000 characters or fewer"),
});

export type AddNoteInput = z.input<typeof addNoteSchema>;
export type AddNoteOutput = z.output<typeof addNoteSchema>;
