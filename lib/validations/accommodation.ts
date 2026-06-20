import { z } from "zod";
import { isDateWithin } from "@/lib/dates";

/** YYYY-MM-DD regex */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

/**
 * Zod schema for creating or updating an Accommodation.
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
