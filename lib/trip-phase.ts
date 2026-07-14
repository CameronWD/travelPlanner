/**
 * Pure trip-phase engine.
 *
 * The Phase is which stage of its life a Trip is in (see CONTEXT.md). It drives
 * what the Home leads with and how the trips list is ordered. Derived from the
 * trip's start date and today — never stored. See ADR 0010.
 */
import { addDays, daysBetween, dayNumberInTrip } from "@/lib/dates";

export const FINAL_PREP_WINDOW_DAYS = 14;

export type TripPhase =
  | "sketching"
  | "planning"
  | "final-prep"
  | "travelling"
  | "past";

export interface TripPhaseInput {
  startDate: string | null;
  endDate: string | null;
  today: string; // YYYY-MM-DD
}

/** Derive the phase. A date-less trip is always sketching. */
export function computeTripPhase({ startDate, endDate, today }: TripPhaseInput): TripPhase {
  if (!startDate) return "sketching";
  const end = endDate ?? startDate; // soft end falls back to the start date
  if (today > end) return "past";
  if (today >= startDate) return "travelling";
  // today < startDate — upcoming
  const finalPrepStart = addDays(startDate, -FINAL_PREP_WINDOW_DAYS);
  return today >= finalPrepStart ? "final-prep" : "planning";
}

const PHASE_LABELS: Record<TripPhase, string> = {
  sketching: "Sketching",
  planning: "Planning",
  "final-prep": "Final prep",
  travelling: "Travelling",
  past: "Past",
};

export interface PhaseDescription {
  phase: TripPhase;
  label: string;
  /** Short status line: "In 26 days", "Day 5 of 11", "Ended 14 days ago". */
  countdown: string;
  /** Big display value for the Home countdown hero, e.g. "26", "5", "Not dated". */
  countdownValue: string;
  /** Small stacked unit beside the value, e.g. "DAYS TO GO"; null when it stands alone. */
  countdownUnit: string | null;
}

function pluralDays(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

export function describePhase(input: TripPhaseInput): PhaseDescription {
  const phase = computeTripPhase(input);
  const { startDate, endDate, today } = input;
  let countdown = "";
  let countdownValue = "";
  let countdownUnit: string | null = null;

  switch (phase) {
    case "sketching":
      countdown = "Not dated yet";
      countdownValue = "Not dated";
      countdownUnit = null;
      break;
    case "planning":
    case "final-prep": {
      const days = daysBetween(today, startDate!); // > 0 (today < start)
      countdown = days === 1 ? "Tomorrow" : `In ${pluralDays(days)}`;
      countdownValue = String(days);
      countdownUnit = days === 1 ? "DAY TO GO" : "DAYS TO GO";
      break;
    }
    case "travelling": {
      const end = endDate ?? startDate!;
      const dayNum = dayNumberInTrip(today, startDate!);
      const total = daysBetween(startDate!, end) + 1;
      countdown = `Day ${dayNum} of ${total}`;
      countdownValue = String(dayNum);
      countdownUnit = `OF ${total}`;
      break;
    }
    case "past": {
      const end = endDate ?? startDate!;
      const ago = daysBetween(end, today); // >= 1 — "past" means today > end
      countdown = `Ended ${pluralDays(ago)} ago`;
      countdownValue = String(ago);
      countdownUnit = ago === 1 ? "DAY AGO" : "DAYS AGO";
      break;
    }
  }

  return { phase, label: PHASE_LABELS[phase], countdown, countdownValue, countdownUnit };
}

/** Lower rank sorts earlier in the trips list. */
export const PHASE_RANK: Record<TripPhase, number> = {
  travelling: 0,
  "final-prep": 1,
  planning: 2,
  sketching: 3,
  past: 4,
};

export interface TripListItem {
  startDate: string | null;
  endDate: string | null;
  /** Date object as returned by Prisma — unlike the string dates above. */
  createdAt: Date;
}

/**
 * Comparator for the trips list: active/upcoming first, then sketching, then
 * past. Within the dated upcoming/active groups, soonest start first; within
 * sketching/past, newest first.
 */
export function compareForTripList(a: TripListItem, b: TripListItem, today: string): number {
  const pa = computeTripPhase({ startDate: a.startDate, endDate: a.endDate, today });
  const pb = computeTripPhase({ startDate: b.startDate, endDate: b.endDate, today });
  if (PHASE_RANK[pa] !== PHASE_RANK[pb]) return PHASE_RANK[pa] - PHASE_RANK[pb];

  // Same phase group.
  if (pa === "sketching" || pa === "past") {
    return b.createdAt.getTime() - a.createdAt.getTime(); // newest first
  }
  // Dated upcoming/active groups: soonest start first. (Two concurrent
  // travelling trips therefore order by who departed first.)
  return (a.startDate ?? "").localeCompare(b.startDate ?? "");
}
