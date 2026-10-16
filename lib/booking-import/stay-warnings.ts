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

/**
 * Recognises a `departsOutsideStay`/`arrivesOutsideStay`/`itemOutsideStay`
 * message (messages.ts) by its fixed wording, for any Stop name or day:
 * `refreshStayWarnings` uses this to drop a Proposal's *previous* stay
 * warning without recomputing it from the Proposal it came from. That
 * Proposal's input may be the date-only shape a Transport end gets at
 * import with no wall time yet (`depAt`/`arrAt` unset, `end.date` only) —
 * `stayWarnings` alone can't tell, from the input, that it once earned one.
 */
function isStaleStayWarning(kind: Proposal["kind"], msg: string): boolean {
  if (kind === "transport") {
    return msg.startsWith("This leaves on a day outside your stay in ") || msg.startsWith("This arrives on a day outside your stay in ");
  }
  if (kind === "item") return msg.startsWith("This is on ") && msg.includes(", outside your stay in ");
  return false;
}

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

/**
 * `next` with its stay warnings recomputed: whatever stay warning `prev`
 * carried (recognised by message shape — see `isStaleStayWarning`, not
 * recomputed from `prev.input`) is dropped, `next`'s current ones are added,
 * and every other warning (a duplicate, a rough Stop, …) is kept. `prev` is
 * taken alongside `next` for the caller's symmetry with `mergeTransportEdit`
 * et al.; both share one `kind` in practice, since an edit never changes it.
 */
export function refreshStayWarnings(prev: Proposal, next: Proposal, stops: ReadonlyMap<string, PreviewStop>): Proposal {
  const kept = next.warnings.filter((w) => !isStaleStayWarning(next.kind, w));
  return { ...next, warnings: [...new Set([...kept, ...stayWarnings(next, stops)])] };
}
