/**
 * The Trip's deadline (ADR 0068, amending ADR 0013): the departure of a dated
 * return leg, else the Hard end date, else none. Every "when am I home"
 * reader goes through this — the Fit tile, Summary, Plan overview, Flags,
 * Make it fit and Compare — so only one deadline is ever shown. Pure.
 *
 * R2 (controller ruling, 2026-10-05): `findReturnLeg` (lib/home-base.ts)
 * picks ONE leg and prefers an arrIsHome candidate — right for "which leg is
 * the return leg" elsewhere, wrong here when more than one dated leg departs
 * the last Stop without arriving at another Stop (e.g. a train to the
 * airport, then a flight — both stored as leaving the last Stop). Preferring
 * arrIsHome would pick the later flight as the deadline, but the deadline is
 * the moment you have to leave — so this module collects ALL such candidates
 * itself (same shape test as `findReturnLeg`) and takes the earliest dated
 * one, rather than deferring to `findReturnLeg`'s single pick.
 */
import type { LegLike } from "@/lib/home-base";
import { orderPlanStops } from "@/lib/plan-order";
import { instantToZonedDateISO } from "@/lib/tz";
import { formatDayLabel } from "@/lib/dates";
import { TRANSPORT_MODES, type TransportMode } from "@/lib/enum-values";

export type TripDeadline =
  | { kind: "return-leg"; date: string; mode: TransportMode; homeward: boolean }
  | { kind: "hard-end"; date: string };

export interface DeadlineStop {
  id: string;
  sortOrder: number;
  arriveDate: string | null;
  departDate: string | null;
  timezone?: string | null;
}

export interface DeadlineLeg extends LegLike {
  mode: string;
  depAt?: Date | string | null;
}

/** The plan's last Stop in canonical plan order (ADR 0038) — the one the return leg departs. */
export function lastPlanStop<S extends DeadlineStop>(stops: readonly S[]): S | null {
  if (stops.length === 0) return null;
  const ordered = orderPlanStops([...stops].sort((a, b) => a.sortOrder - b.sortOrder));
  return ordered[ordered.length - 1];
}

function asMode(mode: string): TransportMode {
  return (TRANSPORT_MODES as readonly string[]).includes(mode) ? (mode as TransportMode) : "OTHER";
}

/** Parses a leg's `depAt` to a valid instant, or null when absent/unparseable. */
function depInstant(leg: DeadlineLeg): Date | null {
  if (!leg.depAt) return null;
  const instant = leg.depAt instanceof Date ? leg.depAt : new Date(leg.depAt);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/**
 * Candidates for the Trip's return leg (same shape test `findReturnLeg`
 * uses: departs the last Stop, doesn't arrive at another Stop) that also
 * carry a parseable departure. A leg with no date is never a candidate.
 */
function dateCandidates(
  transports: readonly DeadlineLeg[],
  lastStopId: string | null,
): Array<{ leg: DeadlineLeg; instant: Date }> {
  if (!lastStopId) return [];
  const result: Array<{ leg: DeadlineLeg; instant: Date }> = [];
  for (const leg of transports) {
    if (leg.fromStopId !== lastStopId || leg.toStopId) continue;
    const instant = depInstant(leg);
    if (instant) result.push({ leg, instant });
  }
  return result;
}

export function resolveTripDeadline(input: {
  stops: readonly DeadlineStop[];
  transports: readonly DeadlineLeg[];
  hardEndDate: string | null;
  /**
   * Trip.roundTrip (default true): whether the dated leg leaving the last
   * Stop is headed home or onward. Carried onto the result as `homeward` so
   * every reader (deadlineLabel, deadlineNoun) gets "home"/"out" wording from
   * one place instead of re-deriving it (R8, one-way trips).
   */
  roundTrip?: boolean;
}): TripDeadline | null {
  const last = lastPlanStop(input.stops);
  // R2: when more than one dated leg leaves the last Stop, the deadline is
  // the EARLIEST departure among them — the moment you have to leave.
  const candidates = dateCandidates(input.transports, last?.id ?? null);
  if (candidates.length > 0) {
    const earliest = candidates.reduce((a, b) => (b.instant < a.instant ? b : a));
    return {
      kind: "return-leg",
      date: instantToZonedDateISO(earliest.instant, last?.timezone || "UTC"),
      mode: asMode(earliest.leg.mode),
      homeward: input.roundTrip ?? true,
    };
  }
  return input.hardEndDate ? { kind: "hard-end", date: input.hardEndDate } : null;
}

const HOME_LEAD: Record<TransportMode, string> = {
  FLIGHT: "Flying", TRAIN: "Train", BUS: "Bus", CAR: "Driving", FERRY: "Ferry", OTHER: "Heading",
};
const HOME_NOUN: Record<TransportMode, string> = {
  FLIGHT: "flight home", TRAIN: "train home", BUS: "bus home", CAR: "drive home", FERRY: "ferry home", OTHER: "trip home",
};
// R8: a one-way Trip's onward leg from the last Stop isn't headed home —
// "Flying out", "your flight out" in place of "home" wording.
const AWAY_NOUN: Record<TransportMode, string> = {
  FLIGHT: "flight out", TRAIN: "train out", BUS: "bus out", CAR: "drive out", FERRY: "ferry out", OTHER: "trip out",
};

/** The Fit tile's reference line: "Flying home Fri 8 Jan" or "Home by Fri 8 Jan". */
export function deadlineLabel(d: TripDeadline): string {
  if (d.kind === "return-leg") {
    const place = d.homeward ? "home" : "out";
    return `${HOME_LEAD[d.mode]} ${place} ${formatDayLabel(d.date)}`;
  }
  return `Home by ${formatDayLabel(d.date)}`;
}

/** What the plan runs past, for Flags and Make it fit: "flight home" (or "flight out"), or "hard end date". */
export function deadlineNoun(d: TripDeadline): string {
  if (d.kind === "return-leg") return d.homeward ? HOME_NOUN[d.mode] : AWAY_NOUN[d.mode];
  return "hard end date";
}
