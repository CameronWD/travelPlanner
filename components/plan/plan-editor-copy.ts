/**
 * The Plan editor's scheduled-move copy and Undo payload (card 2.G). Pure, so
 * both are unit-tested without simulating a drag gesture or an Undo click.
 */

/**
 * Build the Undo-toast copy for a scheduled reorder (ADR 0021). Pure so it can
 * be unit-tested without simulating a drag gesture.
 *
 * @returns `title` ("Moved {name}; {n} stop(s) had dates shifted") and an
 *          optional `description` note when a pin no longer fits.
 */
export function summariseReorder(
  movedName: string,
  changed: { id: string; arriveDate: string; departDate: string }[] | undefined,
  conflicts: { stopId: string; message: string }[] | undefined,
): { title: string; description?: string } {
  const n = changed?.length ?? 0;
  const shifted = n > 0 ? `; ${n} stop${n === 1 ? "" : "s"} had dates shifted` : "";
  const hasConflict = (conflicts?.length ?? 0) > 0;
  return {
    title: `Moved ${movedName}${shifted}`,
    description: hasConflict
      ? "Heads up: a pinned stop no longer fits (see flags)."
      : undefined,
  };
}

/**
 * The shape `shiftStopPayloadTx` hands back on a re-date (ADR 0038/0055) — the
 * pre-images the Undo of that re-date has to write back.
 */
export type ReorderPayload = {
  items: { id: string; date: string | null; prevDate: string; prevStopId?: string }[];
  accommodations: { id: string; checkIn: string; checkOut: string; prevCheckIn: string; prevCheckOut: string }[];
};

/**
 * Turn a re-date's payload pre-images into the payload `restoreStops` writes
 * back, i.e. invert the shift. Dates come from `prevDate`/`prevCheckIn`/
 * `prevCheckOut`; an Item that was **re-filed** onto another Stop (ADR 0055)
 * also carries `prevStopId`, and must be handed its old owning Stop back or
 * Undo silently leaves its Cost on the new Stop's Budget line — the dates
 * alone are identical on a re-file, so nothing else would give it away.
 *
 * Pure so it can be unit-tested without simulating a drag gesture or an Undo
 * click (same reasoning as `summariseReorder`).
 */
export function undoPayloadFor(payload: ReorderPayload): {
  items: { id: string; date: string | null; stopId?: string }[];
  accommodations: { id: string; checkIn: string; checkOut: string }[];
} {
  return {
    items: payload.items.map((i) => ({
      id: i.id,
      date: i.prevDate,
      ...(i.prevStopId ? { stopId: i.prevStopId } : {}),
    })),
    accommodations: payload.accommodations.map((a) => ({
      id: a.id,
      checkIn: a.prevCheckIn,
      checkOut: a.prevCheckOut,
    })),
  };
}
