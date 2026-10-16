/**
 * Booking import, stay warnings (BI-04,
 * docs/follow-ups/2026-10-14-booking-import.md): the "outside your stay"
 * warnings a Transport or Item Proposal earns from its *current* input, so an
 * edit in the Proposal editor can recompute them instead of leaving the ones
 * computed at import. The Accommodation card recomputes its own
 * (accommodationDateWarnings); this doesn't touch that kind.
 */
import { formatDayLabel } from "@/lib/dates";
import { outsideStay, type MatchStop } from "./match";
import { BOOKING_IMPORT_MESSAGES as M } from "./messages";
import type { PreviewStop } from "./preview";
import type { Proposal } from "./types";

/** `outsideStay` only reads a Stop's dates; a PreviewStop has those. */
const asMatchStop = (stop: PreviewStop): MatchStop => ({ ...stop, country: null, countryCode: null, sortOrder: 0 });

/** The "outside your stay" warnings a Transport or Item Proposal earns from its current input. */
export function stayWarnings(proposal: Proposal, stops: ReadonlyMap<string, PreviewStop>): string[] {
  if (proposal.kind === "transport") {
    const { input } = proposal;
    const warnings: string[] = [];
    const from = input.fromStopId ? stops.get(input.fromStopId) : undefined;
    const depDate = input.depAt?.slice(0, 10) ?? null;
    if (from?.arriveDate && outsideStay(asMatchStop(from), depDate)) warnings.push(M.departsOutsideStay(from.name));
    const to = input.toStopId ? stops.get(input.toStopId) : undefined;
    const arrDate = input.arrAt?.slice(0, 10) ?? null;
    if (to?.arriveDate && outsideStay(asMatchStop(to), arrDate)) warnings.push(M.arrivesOutsideStay(to.name));
    return warnings;
  }
  if (proposal.kind === "item") {
    const { input } = proposal;
    const stop = input.stopId ? stops.get(input.stopId) : undefined;
    if (stop?.arriveDate && input.date && outsideStay(asMatchStop(stop), input.date)) return [M.itemOutsideStay(stop.name, formatDayLabel(input.date))];
    return [];
  }
  return [];
}

/** `next` with its stay warnings recomputed: the ones `prev` earned are dropped, `next`'s added; every other warning kept. */
export function refreshStayWarnings(prev: Proposal, next: Proposal, stops: ReadonlyMap<string, PreviewStop>): Proposal {
  const earned = stayWarnings(prev, stops);
  const kept = next.warnings.filter((w) => !earned.includes(w));
  return { ...next, warnings: [...new Set([...kept, ...stayWarnings(next, stops)])] };
}
