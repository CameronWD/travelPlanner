export type DayTransportDefaults = { fromStopId?: string; toStopId?: string };

/** Which Transport a Traveller most likely means when adding one from a given day (spec 2026-10-13 D5). */
export function dayTransportDefaults(
  date: string,
  stop: { id: string; arriveDate: string; departDate: string } | null,
  homeEndpoint: string,
): DayTransportDefaults {
  if (!stop) return {};
  if (date === stop.arriveDate) return { fromStopId: homeEndpoint, toStopId: stop.id };
  if (date === stop.departDate) return { fromStopId: stop.id, toStopId: homeEndpoint };
  return { fromStopId: stop.id };
}
