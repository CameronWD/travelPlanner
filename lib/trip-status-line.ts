/**
 * The trip switcher's status line (desktop-home spec §1 / beta-feedback §A):
 * "68 sleeps to go" / "1 sleep to go" / "Today" / "Day 5 of 35" / "Back home" /
 * "No dates yet". Built on the same phase engine as the rest of the app
 * (lib/trip-phase.ts) so the switcher can never disagree with the Home
 * countdown about which phase a Trip is in.
 */
import { computeTripPhase } from "@/lib/trip-phase";
import { daysBetween, dayNumberInTrip } from "@/lib/dates";

export interface TripStatusLineInput {
  startDate: string | null;
  endDate: string | null;
  today: string; // YYYY-MM-DD
}

/** One "sleep to go" per day; single/plural agrees with the count. */
function sleepsToGo(days: number): string {
  return days === 1 ? "1 sleep to go" : `${days} sleeps to go`;
}

export function tripStatusLine({ startDate, endDate, today }: TripStatusLineInput): string {
  const phase = computeTripPhase({ startDate, endDate, today });

  switch (phase) {
    case "sketching":
      return "No dates yet";
    case "planning":
    case "final-prep":
      // today < startDate in both these phases (see computeTripPhase).
      return sleepsToGo(daysBetween(today, startDate!));
    case "travelling": {
      const end = endDate ?? startDate!;
      // Nights in the trip, not an inclusive day count — a same-day trip
      // (nights === 0) reads as "Today" rather than "Day 1 of 0".
      const nights = daysBetween(startDate!, end);
      if (nights === 0) return "Today";
      return `Day ${dayNumberInTrip(today, startDate!)} of ${nights}`;
    }
    case "past":
      return "Back home";
  }
}
