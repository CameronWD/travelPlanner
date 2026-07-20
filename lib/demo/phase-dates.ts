import { addDays } from "@/lib/dates";

export interface PhaseDates {
  finalPrep: { start: string; end: string };
  travelling: { start: string; end: string };
  past: { start: string; end: string };
}

export function phaseDates(today: string): PhaseDates {
  return {
    finalPrep: { start: addDays(today, 3), end: addDays(today, 5) },   // leaves in 3 days (< 14)
    travelling: { start: addDays(today, -2), end: addDays(today, 4) }, // day 3 of 7
    past: { start: addDays(today, -21), end: addDays(today, -7) },     // ended 7 days ago
  };
}
