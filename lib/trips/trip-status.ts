/**
 * Trips-page card status (spec 2026-09-28-trips-page-carousel D6, P3;
 * CONTEXT.md "Phase"): the card labels Idea / Planning / Up next / On the
 * road / Done are names for Phases on this page, not new states. Pure.
 */
import { computeTripPhase, compareForTripList, type TripPhase } from "@/lib/trip-phase";
import { countdownFor } from "@/lib/countdown";
import { formatDateRangeCompact, formatMonthYear, daysBetween, dayNumberInTrip } from "@/lib/dates";
import { formatRoughMonth } from "@/lib/rough-month";

export type TripCardKind = "up-next" | "on-the-road" | "planning" | "idea" | "done";

export interface CardTrip {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: Date;
  stopCount: number;
}

function phaseOf(t: CardTrip, today: string, byId?: Map<string, string>): TripPhase {
  return computeTripPhase({ startDate: t.startDate, endDate: t.endDate, today: byId?.get(t.id) ?? today });
}

/**
 * Handoff §4 card order: the nearest upcoming or in-progress trip; other
 * upcoming by start date; ideas newest-created first; done most recent
 * (latest end date) first. compareForTripList already does everything but
 * the done tie-break, which it orders by createdAt.
 */
export function orderForCarousel<T extends CardTrip>(trips: T[], today: string, todayByTripId?: Map<string, string>): T[] {
  return [...trips].sort((a, b) => {
    const pa = phaseOf(a, today, todayByTripId);
    const pb = phaseOf(b, today, todayByTripId);
    if (pa === "past" && pb === "past") {
      const ea = a.endDate ?? a.startDate ?? "";
      const eb = b.endDate ?? b.startDate ?? "";
      return eb.localeCompare(ea) || b.createdAt.getTime() - a.createdAt.getTime();
    }
    return compareForTripList(a, b, today, todayByTripId);
  });
}

export function cardKind(phase: TripPhase, isFirst: boolean): TripCardKind {
  if (phase === "past") return "done";
  if (phase === "sketching") return "idea";
  if (phase === "travelling") return "on-the-road";
  return isFirst ? "up-next" : "planning";
}

const LABELS: Record<TripCardKind, string> = {
  "up-next": "UP NEXT",
  "on-the-road": "ON THE ROAD",
  planning: "PLANNING",
  idea: "IDEA",
  done: "DONE",
};
export function cardLabel(kind: TripCardKind): string {
  return LABELS[kind];
}

export interface BigNumber {
  value: string;
  /** Two stacked lines under/beside the number; null when the value stands alone ("Today"). */
  unit: [string, string] | null;
  /** A line above the value — "Sometime in" for a Rough month. */
  lead?: string;
}

export function cardBigNumber({ kind, startDate, endDate, today, roughMonth }: { kind: TripCardKind; startDate: string | null; endDate: string | null; today: string; roughMonth?: string | null }): BigNumber {
  if (kind === "idea") {
    if (roughMonth && !startDate) return { value: formatRoughMonth(roughMonth, today), unit: null, lead: "Sometime in" };
    return { value: startDate ? startDate.slice(0, 4) : "?", unit: ["dates", "not set"] };
  }
  if (kind === "done") {
    const nights = startDate ? daysBetween(startDate, endDate ?? startDate) : 0;
    return { value: String(nights), unit: [nights === 1 ? "night" : "nights", "away"] };
  }
  const c = countdownFor({ startDate, endDate, today });
  switch (c.kind) {
    case "sleeps":
      return { value: String(c.n), unit: [c.unit, "to go"] };
    case "today":
      return { value: "Today", unit: null };
    case "day":
      return { value: String(c.n), unit: [`of ${c.of}`, "days"] };
    case "home":
      return { value: "Back home", unit: null };
    case "no-dates":
    case "rough-month":
      return { value: "?", unit: ["dates", "not set"] };
  }
}

function stops(n: number): string {
  return n === 1 ? "1 stop" : `${n} stops`;
}

export function cardDateLine({ kind, startDate, endDate, stopCount, today, currentStop }: {
  kind: TripCardKind; startDate: string | null; endDate: string | null; stopCount: number; today: string; currentStop?: string | null;
}): string {
  if (kind === "idea" || !startDate) return "Add dates";
  const end = endDate ?? startDate;
  if (kind === "on-the-road") {
    const n = dayNumberInTrip(today, startDate);
    const m = daysBetween(startDate, end) + 1;
    const day = `Day ${n} of ${m}`;
    return currentStop ? `${day} · ${currentStop}` : day;
  }
  if (kind === "done") {
    return `${formatMonthYear(startDate).replace(/^(\w{3})\w* /, "$1 ")} · ${stops(stopCount)}`;
  }
  const range = formatDateRangeCompact(startDate, end);
  return kind === "up-next" ? `${range} · ${stops(stopCount)}` : range;
}

export function tripsMetaLine({ upcoming, done }: { upcoming: number; done: number }): string {
  const parts: string[] = [];
  if (upcoming > 0) parts.push(`${upcoming} coming up`);
  if (done > 0) parts.push(`${done} done`);
  return parts.length ? parts.join(" · ") : "Nothing planned yet";
}

export function countUpcomingAndDone(trips: CardTrip[], today: string, todayByTripId?: Map<string, string>): { upcoming: number; done: number } {
  let done = 0;
  for (const t of trips) if (phaseOf(t, today, todayByTripId) === "past") done++;
  return { upcoming: trips.length - done, done };
}

export function cardAccessibleName(name: string, kind: TripCardKind, big: BigNumber): string {
  const status = LABELS[kind].toLowerCase();
  const countdown = big.lead ? `${big.lead} ${big.value}` : big.unit ? `${big.value} ${big.unit[0]} ${big.unit[1]}`.replace(/^\? /, "") : big.value;
  return `${name}, ${status}, ${countdown}`;
}
