import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currencies";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

export const createTripSchema = z
  .object({
    name: z.string().trim().min(1, "Trip name is required").max(120, "Trip name must be 120 characters or fewer"),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    homeCurrency: z.enum(CURRENCY_CODES as [string, ...string[]], { error: "Please select a valid currency" }),
  })
  .refine((d) => d.startDate == null || d.endDate == null || d.endDate >= d.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export type CreateTripInput = z.infer<typeof createTripSchema>;
export const tripSchema = createTripSchema;
export type TripInput = z.infer<typeof tripSchema>;
