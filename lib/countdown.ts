/**
 * The desktop Home countdown tile's number (spec 2026-09-27-desktop-home §4)
 * and its first-leg line. Pure — derived from the Trip's dates and today,
 * like the Phase (ADR 0010).
 *
 * The travelling "Day N of M" count is inclusive on both sides, the same base
 * as `describePhase` (lib/trip-phase.ts) and the shell's status line
 * (lib/trip-status-line.ts): 4 Dec–8 Jan is 36 days, 8 Dec is day 5.
 */
import { daysBetween, dayNumberInTrip, formatDayLabel } from "@/lib/dates";
import { formatRoughMonth } from "@/lib/rough-month";

export type Countdown =
  | { kind: "sleeps"; n: number; unit: "sleep" | "sleeps" }
  | { kind: "today" }
  | { kind: "day"; n: number; of: number }
  | { kind: "home" }
  | { kind: "no-dates" }
  | { kind: "rough-month"; month: string };

export function countdownFor({
  startDate,
  endDate,
  today,
  roughMonth,
}: {
  startDate: string | null;
  endDate: string | null;
  today: string;
  roughMonth?: string | null;
}): Countdown {
  if (!startDate) return roughMonth ? { kind: "rough-month", month: formatRoughMonth(roughMonth, today) } : { kind: "no-dates" };
  const end = endDate ?? startDate; // soft end falls back to the start date
  if (today < startDate) {
    const n = daysBetween(today, startDate);
    return { kind: "sleeps", n, unit: n === 1 ? "sleep" : "sleeps" };
  }
  if (today === startDate) return { kind: "today" };
  if (today <= end) {
    return { kind: "day", n: dayNumberInTrip(today, startDate), of: daysBetween(startDate, end) + 1 };
  }
  return { kind: "home" };
}

/** Screen-reader / label text for a countdown ("68 sleeps to go", "Day 5 of 36"). */
export function countdownLabel(c: Countdown): string {
  switch (c.kind) {
    case "sleeps":
      return `${c.n} ${c.unit} to go`;
    case "today":
      return "Today";
    case "day":
      return `Day ${c.n} of ${c.of}`;
    case "home":
      return "Back home";
    case "no-dates":
      return "Pick your dates";
    case "rough-month":
      return `Sometime in ${c.month}`;
  }
}

export interface FirstLegInput {
  /** The Trip's first Transport leg, already resolved by the loader. */
  transport: {
    /** Departure's calendar date (YYYY-MM-DD) in the origin's zone; null = no time yet. */
    depDate: string | null;
    /** Where the leg leaves from, when it isn't the Home base. */
    origin: string | null;
    /** Where it arrives (its to-Stop), when known. */
    destination: string | null;
  } | null;
  homeName: string | null;
  firstStop: { name: string } | null;
}

/**
 * "Fri 4 Dec · Sydney → Denpasar, Bali": the first leg's day, then origin →
 * first Stop. No leg: just the first Stop's name. No Stops either: null.
 */
export function firstLegLine({ transport, homeName, firstStop }: FirstLegInput): string | null {
  const fallback = firstStop?.name ?? null;
  if (!transport) return fallback;
  const origin = transport.origin ?? homeName;
  const destination = transport.destination ?? firstStop?.name ?? null;
  const route = origin && destination ? `${origin} → ${destination}` : (destination ?? origin);
  const parts = [transport.depDate ? formatDayLabel(transport.depDate) : null, route].filter(
    (p): p is string => !!p,
  );
  return parts.length > 0 ? parts.join(" · ") : fallback;
}
