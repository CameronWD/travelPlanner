import { isDateWithin } from "@/lib/dates";

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
