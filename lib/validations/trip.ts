import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currencies";

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

/** A YYYY-MM-DD date that is optional: a blank string (from an empty date input) is treated as "no date". */
const optionalIsoDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  isoDateString.optional(),
);

export const createTripSchema = z
  .object({
    name: z.string().trim().min(1, "Trip name is required").max(120, "Trip name must be 120 characters or fewer"),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    hardEndDate: optionalIsoDate,
    homeCurrency: z.enum(CURRENCY_CODES as [string, ...string[]], { error: "Please select a valid currency" }),
    homeName: z.string().trim().max(120, "Home base must be 120 characters or fewer").optional().or(z.literal("")),
    roundTrip: z.boolean().optional(),
  })
  .refine((d) => d.startDate == null || d.endDate == null || d.endDate >= d.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  })
  .refine((d) => d.startDate == null || d.hardEndDate == null || d.hardEndDate >= d.startDate, {
    message: "Hard end date must be on or after the start date",
    path: ["hardEndDate"],
  });

export type CreateTripInput = z.infer<typeof createTripSchema>;
export const tripSchema = createTripSchema;
export type TripInput = z.infer<typeof tripSchema>;
