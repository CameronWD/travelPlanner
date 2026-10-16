import { z } from "zod";
import { CHAPTER_COLOUR_VALUES } from "@/lib/chapter-colours";
import { isoDate } from "@/lib/validations/primitives";

const chapterColourSchema = z.enum(CHAPTER_COLOUR_VALUES);

export const chapterSchema = z
  .object({
    name: z.string().trim().min(1, "Chapter name is required").max(120, "Chapter name must be 120 characters or fewer"),
    colour: chapterColourSchema,
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  })
  .refine((d) => (d.startDate == null) === (d.endDate == null), {
    message: "Set both dates or neither",
    path: ["endDate"],
  })
  .refine((d) => d.startDate == null || d.endDate == null || d.endDate >= d.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export type ChapterInput = z.infer<typeof chapterSchema>;
