import { z } from "zod";
import { chapterColourSchema } from "@/lib/chapter-colours";

/** YYYY-MM-DD date string regex */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

/**
 * Zod schema for creating or updating a Chapter.
 *
 * Validates:
 *   - name: non-empty, trimmed, max 120 chars
 *   - colour: one of the 8 palette colour values
 *   - startDate / endDate: YYYY-MM-DD; endDate must be >= startDate
 */
export const chapterSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Chapter name is required")
      .max(120, "Chapter name must be 120 characters or fewer"),
    colour: chapterColourSchema,
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export type ChapterInput = z.infer<typeof chapterSchema>;
