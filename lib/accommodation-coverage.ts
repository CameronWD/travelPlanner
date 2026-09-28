import { addDays, nightsBetween } from "@/lib/dates";

/**
 * How many nights of a scheduled Stop's stay (arrive → depart) no
 * Accommodation covers. A night is covered when some booking has
 * checkIn <= night < checkOut. Shared by Flag rule 14 (lib/flags.ts) and
 * the Stop card's add affordance (spec 2026-09-28 D6): "Add accommodation"
 * while any night is uncovered, "Add another place" once every night is.
 */
export function uncoveredNights(
  stop: { arriveDate: string; departDate: string },
  accommodations: Array<{ checkIn: string; checkOut: string }>,
): number {
  const nights = nightsBetween(stop.arriveDate, stop.departDate);
  let uncovered = 0;
  for (let d = 0; d < nights; d++) {
    const night = addDays(stop.arriveDate, d);
    if (!accommodations.some((a) => a.checkIn <= night && night < a.checkOut)) uncovered++;
  }
  return uncovered;
}
