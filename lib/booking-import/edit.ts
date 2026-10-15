/**
 * Booking import, Edit (spec 2026-10-14 "Edit"): fold what an existing form
 * dialog hands back into the Proposal it edits. Zod-free, so the client
 * editor can import it (lib/client-zod.guard.test.ts).
 */
import type { ActionResult } from "@/lib/action-result";
import type { ConfirmProposalResult, ProposedStopInput, ProposedTransportInput } from "./types";

/** Drops keys whose value is undefined, so a merged input compares and serialises cleanly. */
function defined<T extends object>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as T;
}

/**
 * The edit form drops import-only zone hints; keep each while its end is
 * still the same place: the same Stop (a rough Stop with no zone yet reads
 * its end in the hint, final review #1), or, with no Stop, the same Home or
 * free-text place.
 */
export function mergeTransportEdit(prev: ProposedTransportInput, edited: ProposedTransportInput): ProposedTransportInput {
  const depSame = edited.fromStopId
    ? edited.fromStopId === prev.fromStopId
    : !prev.fromStopId && (edited.depIsHome ? Boolean(prev.depIsHome) : !prev.depIsHome && edited.depPlace === prev.depPlace);
  const arrSame = edited.toStopId
    ? edited.toStopId === prev.toStopId
    : !prev.toStopId && (edited.arrIsHome ? Boolean(prev.arrIsHome) : !prev.arrIsHome && edited.arrPlace === prev.arrPlace);
  const merged: ProposedTransportInput = { ...edited };
  if (depSame && prev.depTimezone) merged.depTimezone = prev.depTimezone;
  if (arrSame && prev.arrTimezone) merged.arrTimezone = prev.arrTimezone;
  return defined(merged);
}

/** The Stop form has no country code field; keep the import's while the place is unchanged. */
export function mergeStopEdit(prev: ProposedStopInput, edited: ProposedStopInput): ProposedStopInput {
  const samePlace = edited.name === prev.name && edited.country === prev.country;
  return defined({ ...edited, ...(samePlace && !edited.countryCode && prev.countryCode ? { countryCode: prev.countryCode } : {}) });
}

/** A confirm's outcome as the form dialog's submit expects it; the message shows as the form-level line. */
export function toActionResult(res: ConfirmProposalResult): ActionResult {
  return res.ok ? { success: true } : { success: false, errors: { _: [res.message], ...(res.errors ?? {}) } };
}
