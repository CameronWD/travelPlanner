/**
 * ADR 0073 — a dated Trip's only Stop takes the Trip's dates, so the UI offers
 * no rough mode for it. `stopCount` is the plan's Stop count including the Stop
 * in question (an Add sheet on an empty plan passes `stops.length + 1`).
 */
export function isLoneOnDatedTrip(
  stopCount: number,
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined,
): boolean {
  return stopCount === 1 && Boolean(tripStartDate && tripEndDate);
}
