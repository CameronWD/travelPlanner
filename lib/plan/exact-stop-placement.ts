import { orderPlanStops, type OrderableStop } from "@/lib/plan-order";

const NEW_ID = "__exact-stop-placement/new__";

const bySortOrder = <S extends OrderableStop>(stops: readonly S[]): S[] => [...stops].sort((a, b) => a.sortOrder - b.sortOrder);

/**
 * Translate a stop picked in the plan (display) order into createStop's
 * `afterStopId`, which inserts by *stored* sortOrder. orderPlanStops keeps
 * every rough stop at its stored index and re-deals scheduled stops by date
 * into the scheduled indices, so display position i and stored position i
 * are the same kind of slot. Inserting after the stored stop at the picked
 * stop's display position lands the new stop right behind the picked one,
 * even when stored sortOrder has drifted from date order (old appends,
 * re-dated stops).
 */
export function storedAnchorFor(stops: readonly OrderableStop[], displayedId: string | null): string | null {
  if (displayedId === null) return null;
  const stored = bySortOrder(stops);
  const at = orderPlanStops(stored).findIndex((s) => s.id === displayedId);
  return at === -1 ? null : stored[at].id;
}

/**
 * Where a new *scheduled* stop goes (PLAN.md §7.4 "GOES AFTER", Exact dates).
 * A scheduled Stop's position is its dates (CONTEXT.md, ADR 0038), so the
 * anchor comes from the range, not a free choice: the last scheduled stop in
 * plan order arriving on or before the new arrive date.
 *
 * Dated before every scheduled stop, the anchor is the first scheduled stop:
 * the new stop takes that stop's slot on the date re-deal and the stop shifts
 * into the new slot right behind it — the same result as a true prepend, which
 * createStop can't express (a null anchor appends). With no scheduled stops the
 * stop is appended (afterId null).
 *
 * `stops` may come in any order; they carry their stored sortOrder.
 * `afterId` is what createStop and addStopConsequence take (a stored anchor,
 * see storedAnchorFor); `precedingId` is the stop the new one is displayed
 * right after once saved (null: it goes first), found by simulating the
 * server's insert over the stored arrangement.
 */
export function exactStopPlacement(
  stops: readonly OrderableStop[],
  arrive: string,
  depart: string,
): { afterId: string | null; precedingId: string | null } {
  const stored = bySortOrder(stops);
  const scheduled = orderPlanStops(stored).filter((s) => s.arriveDate != null);
  const anchor = scheduled.filter((s) => (s.arriveDate as string) <= arrive).at(-1) ?? scheduled[0] ?? null;
  const afterId = storedAnchorFor(stored, anchor?.id ?? null);

  // Mirror createStop: +1 after the stored anchor with later siblings bumped,
  // or max + 1 when appending.
  const idx = afterId ? stored.findIndex((s) => s.id === afterId) + 1 : stored.length;
  const arranged = [...stored.slice(0, idx), { id: NEW_ID, sortOrder: 0, arriveDate: arrive, departDate: depart }, ...stored.slice(idx)].map((s, i) => ({ ...s, sortOrder: i }));
  const ordered = orderPlanStops(arranged);
  const at = ordered.findIndex((s) => s.id === NEW_ID);

  return { afterId, precedingId: at > 0 ? ordered[at - 1].id : null };
}
