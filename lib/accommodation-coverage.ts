import { addDays, nightsBetween } from "@/lib/dates";

/**
 * The nights (each the evening's YYYY-MM-DD) of a scheduled Stop's stay
 * (arrive → depart) that no Accommodation covers, in date order. A night is
 * covered when some booking has checkIn <= night < checkOut. The stay panel
 * names them ("no bed Fri 11 Dec", spec 2026-10-04 §B).
 */
export function uncoveredNightDates(
  stop: { arriveDate: string; departDate: string },
  accommodations: Array<{ checkIn: string; checkOut: string }>,
): string[] {
  const nights = nightsBetween(stop.arriveDate, stop.departDate);
  const open: string[] = [];
  for (let d = 0; d < nights; d++) {
    const night = addDays(stop.arriveDate, d);
    if (!accommodations.some((a) => a.checkIn <= night && night < a.checkOut)) open.push(night);
  }
  return open;
}

/**
 * How many nights of a scheduled Stop's stay no Accommodation covers. Shared
 * by Flag rule 14 (lib/flags.ts) and the Stop card's add affordance (spec
 * 2026-09-28 D6): "Add accommodation" while any night is uncovered, "Add
 * another place" once every night is.
 */
export function uncoveredNights(
  stop: { arriveDate: string; departDate: string },
  accommodations: Array<{ checkIn: string; checkOut: string }>,
): number {
  return uncoveredNightDates(stop, accommodations).length;
}
