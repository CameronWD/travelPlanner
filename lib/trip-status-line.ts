/**
 * The trip switcher's status line (desktop-home spec §1 / beta-feedback §A):
 * "68 sleeps to go" / "1 sleep to go" / "Today" / "Day 5 of 36" / "Back home" /
 * "No dates yet". Built on `describePhase` (lib/trip-phase.ts) — the same
 * engine that drives the Home countdown — so the two can never disagree
 * about which phase a Trip is in, or (fix round 1) about the day math: the
 * "Day X of Y" line reuses `describePhase`'s own `countdown` string directly
 * rather than a second, differently-denominated implementation. Y there is
 * an INCLUSIVE day count (`daysBetween(start, end) + 1`), same as
 * `describePhase` — a Trip from Dec 4 to Jan 8 is "Day 36 of 36" on Jan 8,
 * not "Day 35 of 35".
 */
import { describePhase } from "@/lib/trip-phase";
import { daysBetween } from "@/lib/dates";

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
  const desc = describePhase({ startDate, endDate, today });

  switch (desc.phase) {
    case "sketching":
      return "No dates yet";
    case "planning":
    case "final-prep":
      // today < startDate in both these phases (see computeTripPhase).
      return sleepsToGo(daysBetween(today, startDate!));
    case "travelling":
      // Same-day trip: describePhase's own "Day 1 of 1" reads awkwardly for
      // a status line — say "Today" instead.
      if ((endDate ?? startDate) === startDate) return "Today";
      return desc.countdown; // "Day X of Y" — describePhase's own day math.
    case "past":
      return "Back home";
  }
}
