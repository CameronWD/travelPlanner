import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currencies";

/**
 * Zod schema for creating a new trip.
 *
 * Validates:
 *   - name: non-empty trimmed string, max 120 chars
 *   - startDate / endDate: YYYY-MM-DD strings; endDate must be >= startDate
 *   - homeCurrency: must be one of the known currency codes
 */
export const createTripSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Trip name is required")
      .max(120, "Trip name must be 120 characters or fewer"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
    homeCurrency: z.enum(CURRENCY_CODES as [string, ...string[]], {
      error: "Please select a valid currency",
    }),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export type CreateTripInput = z.infer<typeof createTripSchema>;
