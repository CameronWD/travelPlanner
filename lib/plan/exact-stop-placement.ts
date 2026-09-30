import { orderPlanStops, type OrderableStop } from "@/lib/plan-order";

const NEW_ID = "__exact-stop-placement/new__";

/**
 * Where a new *scheduled* stop goes (PLAN.md §7.4 "GOES AFTER", Exact dates).
 * A scheduled Stop's position is its dates (CONTEXT.md, ADR 0038), so the
 * anchor comes from the range, not a free choice: the last scheduled stop (in
 * plan order) arriving on or before the new arrive date.
 *
 * Dated before every scheduled stop, the anchor is the first scheduled stop:
 * orderPlanStops re-deals scheduled slots by date, so the new stop takes that
 * stop's slot and the stop shifts into the new slot right behind it — the same
 * result as a true prepend, which createStop has no way to express (a null
 * anchor appends). With no scheduled stops the stop is appended (afterId null).
 *
 * `stops` must be in plan (display) order. `afterId` is what createStop and
 * addStopConsequence take; `precedingId` is the stop the new one ends up right
 * after once the plan is re-ordered (null: it goes first).
 */
export function exactStopPlacement(
  stops: readonly OrderableStop[],
  arrive: string,
  depart: string,
): { afterId: string | null; precedingId: string | null } {
  const scheduled = stops.filter((s) => s.arriveDate != null);
  const anchor = scheduled.filter((s) => (s.arriveDate as string) <= arrive).at(-1) ?? scheduled[0] ?? null;

  // Mirror the server's insert: +1 after the anchor with later siblings bumped,
  // or max + 1 when appending.
  const idx = anchor ? stops.indexOf(anchor) + 1 : stops.length;
  const arranged = [...stops.slice(0, idx), { id: NEW_ID, sortOrder: 0, arriveDate: arrive, departDate: depart }, ...stops.slice(idx)].map((s, i) => ({ ...s, sortOrder: i }));
  const ordered = orderPlanStops(arranged);
  const at = ordered.findIndex((s) => s.id === NEW_ID);

  return { afterId: anchor?.id ?? null, precedingId: at > 0 ? ordered[at - 1].id : null };
}
