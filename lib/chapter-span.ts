/**
 * Pure helper: compute the date span that covers a set of stops.
 *
 * Only stops that have BOTH arriveDate AND departDate non-null are considered.
 * Returns `{ startDate: null, endDate: null }` when no qualifying stop exists.
 *
 * ISO `YYYY-MM-DD` strings compare correctly with `<`/`>`, so no date parsing
 * is needed.
 */
export function chapterSpan(
  stops: { arriveDate: string | null; departDate: string | null }[],
): { startDate: string | null; endDate: string | null } {
  const dated = stops.filter((s) => s.arriveDate != null && s.departDate != null);
  if (dated.length === 0) return { startDate: null, endDate: null };

  let startDate = dated[0].arriveDate!;
  let endDate = dated[0].departDate!;
  for (const s of dated) {
    if (s.arriveDate! < startDate) startDate = s.arriveDate!;
    if (s.departDate! > endDate) endDate = s.departDate!;
  }
  return { startDate, endDate };
}
