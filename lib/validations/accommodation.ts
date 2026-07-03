import { z } from "zod";
import { isDateWithin } from "@/lib/dates";
import { CURRENCY_CODES } from "@/lib/currencies";

/** YYYY-MM-DD regex */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

/**
 * Zod schema for creating or updating an Accommodation.
 *
 * The optional cost fields (estimatedMinor, currency, actualMinor, paidAt)
 * let callers capture a single accommodation-owned Cost in one step, without
 * requiring a separate CostEditor interaction. All cost fields are optional —
 * an accommodation with no cost still validates.
 */
export const accommodationSchema = z
  .object({
    stopId: z.string().trim().min(1, "Stop is required"),
    name: z
      .string()
      .trim()
      .min(1, "Accommodation name is required")
      .max(120, "Name must be 120 characters or fewer"),
    address: z.string().trim().optional(),
    checkIn: isoDate,
    checkOut: isoDate,
    confirmation: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),

    // --- Inline cost fields (all optional) ---

    /** Estimated cost in minor units (e.g. cents). Integer. */
    estimatedMinor: z
      .number()
      .int("Estimated amount must be a whole number in minor units")
      .min(0, "Estimated amount must be 0 or greater")
      .max(2_147_483_647, "Amount is too large")
      .optional(),

    /** ISO 4217 currency code. Required when estimatedMinor is set. */
    currency: z
      .string()
      .length(3, "Currency must be a 3-letter ISO 4217 code")
      .toUpperCase()
      .refine((c) => CURRENCY_CODES.includes(c), {
        message: "Unsupported currency code",
      })
      .optional(),

    /** Actual cost in minor units. Optional. */
    actualMinor: z
      .number()
      .int("Actual amount must be a whole number in minor units")
      .min(0, "Actual amount must be 0 or greater")
      .max(2_147_483_647, "Amount is too large")
      .nullable()
      .optional(),

    /** ISO date string for when the cost was paid. Optional. */
    paidAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "paidAt must be YYYY-MM-DD")
      .nullable()
      .optional(),
  })
  .refine((data) => data.checkOut >= data.checkIn, {
    message: "Check-out must be on or after check-in",
    path: ["checkOut"],
  });

export type AccommodationInput = z.infer<typeof accommodationSchema>;

// ---------------------------------------------------------------------------
// Date-within-stop soft warning helper
// ---------------------------------------------------------------------------

export interface AccommodationDateWarningInput {
  checkIn: string;
  checkOut: string;
}

export interface StopDateRange {
  arriveDate: string;
  departDate: string;
}

/**
 * Returns an array of soft warning strings when the accommodation dates fall
 * outside the parent stop's date range.
 *
 * These are NON-BLOCKING — show them in the UI but do not make the form
 * invalid.
 */
export function accommodationDateWarnings(
  acc: AccommodationDateWarningInput,
  stop: StopDateRange,
): string[] {
  const warnings: string[] = [];

  if (!isDateWithin(acc.checkIn, stop.arriveDate, stop.departDate)) {
    if (acc.checkIn < stop.arriveDate) {
      warnings.push("Check-in is before you arrive in this stop");
    } else {
      warnings.push("Check-in is after you leave this stop");
    }
  }

  if (!isDateWithin(acc.checkOut, stop.arriveDate, stop.departDate)) {
    if (acc.checkOut > stop.departDate) {
      warnings.push("Check-out is after you leave this stop");
    } else {
      warnings.push("Check-out is before you arrive in this stop");
    }
  }

  return warnings;
}
