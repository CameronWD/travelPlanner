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

const DEPARTS_PREFIX = "This leaves on a day outside your stay in ";
const ARRIVES_PREFIX = "This arrives on a day outside your stay in ";
const isItemStayWarning = (msg: string) => msg.startsWith("This is on ") && msg.includes(", outside your stay in ");

/**
 * Whether `next` can stand behind (or retract) the stay warning `prev`
 * carried for one end: it can when that end has a date to check (`depAt`,
 * `arrAt`, an Item's `date`), when that date changed, or when the end's Stop
 * changed. Otherwise the warning is kept as is — a Transport end gets the
 * date-only shape at import (`end.date`, no wall time, so `depAt`/`arrAt`
 * unset) and nothing in its input can re-earn the warning build.ts gave it
 * (BI-04: opening the editor or editing an unrelated field must keep it).
 */
const endIsRecheckable = (prevDate: string | undefined | null, nextDate: string | undefined | null, prevStop: string | undefined | null, nextStop: string | undefined | null) =>
  !!nextDate || (prevDate ?? null) !== (nextDate ?? null) || (prevStop ?? null) !== (nextStop ?? null);

/**
 * `prev`'s stay warnings (recognised by their fixed wording in messages.ts,
 * for any Stop name or day) that `next` re-decides — see `endIsRecheckable`.
 */
function isStaleStayWarning(prev: Proposal, next: Proposal, msg: string): boolean {
  if (next.kind === "transport") {
    const before = prev.kind === "transport" ? prev.input : next.input;
    const { input } = next;
    if (msg.startsWith(DEPARTS_PREFIX)) return endIsRecheckable(before.depAt, input.depAt, before.fromStopId, input.fromStopId);
    if (msg.startsWith(ARRIVES_PREFIX)) return endIsRecheckable(before.arrAt, input.arrAt, before.toStopId, input.toStopId);
    return false;
  }
  if (next.kind === "item") {
    const before = prev.kind === "item" ? prev.input : next.input;
    return isItemStayWarning(msg) && endIsRecheckable(before.date, next.input.date, before.stopId, next.input.stopId);
  }
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
 * `next` with its stay warnings recomputed: a stay warning `next` carries is
 * dropped only for an end `next` re-decides (a date, a changed date or a
 * changed Stop — `isStaleStayWarning`; recognised by message shape, not
 * recomputed from `prev.input`), `next`'s current ones are added, and every
 * other warning (a duplicate, a rough Stop, a date-only end's import-time
 * stay warning, …) is kept. `prev` is the Proposal the edit started from;
 * both share one `kind` in practice, since an edit never changes it.
 */
export function refreshStayWarnings(prev: Proposal, next: Proposal, stops: ReadonlyMap<string, PreviewStop>): Proposal {
  const kept = next.warnings.filter((w) => !isStaleStayWarning(prev, next, w));
  return { ...next, warnings: [...new Set([...kept, ...stayWarnings(next, stops)])] };
}
