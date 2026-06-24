import { z } from "zod";
import { chapterColourSchema } from "@/lib/chapter-colours";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

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
