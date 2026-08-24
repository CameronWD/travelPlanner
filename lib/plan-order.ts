/**
 * Canonical plan order (ADR 0038): a scheduled Stop's position IS its dates.
 * Scheduled stops render in date order; rough stops keep the slot the
 * traveller put them in relative to their neighbours (their sortOrder slot).
 */

export interface OrderableStop {
  id: string;
  sortOrder: number;
  arriveDate: string | null;
  departDate: string | null;
}

/** Chronological comparator for scheduled stops; sortOrder/id break ties. */
export function compareScheduled(
  a: { id: string; sortOrder: number; arriveDate: string; departDate: string | null },
  b: { id: string; sortOrder: number; arriveDate: string; departDate: string | null },
): number {
  return (
    a.arriveDate.localeCompare(b.arriveDate) ||
    (a.departDate ?? "").localeCompare(b.departDate ?? "") ||
    a.sortOrder - b.sortOrder ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Input must be in arrangement (sortOrder) order. Scheduled stops are
 * re-sorted chronologically and re-dealt into the scheduled slots; rough
 * stops keep their exact indices. Pure; never mutates the input.
 */
export function orderPlanStops<S extends OrderableStop>(stops: readonly S[]): S[] {
  const scheduled = stops
    .filter((s): s is S & { arriveDate: string } => s.arriveDate != null)
    .sort(compareScheduled);
  let cursor = 0;
  return stops.map((s) => (s.arriveDate != null ? scheduled[cursor++] : s));
}
