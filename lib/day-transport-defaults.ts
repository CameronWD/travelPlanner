export type DayTransportDefaults = { fromStopId?: string; toStopId?: string };

type PlanStop = { id: string; arriveDate: string | null; departDate: string | null; sortOrder: number };

/**
 * Which Transport a Traveller most likely means when adding one from a given
 * day (spec 2026-10-13 D5). On a changeover day the other end is the
 * neighbouring scheduled Stop; Home base only bookends the first arrival and
 * the last departure. `stops` is the plan's Stops in any order; rough ones are
 * ignored.
 */
export function dayTransportDefaults(
  date: string,
  stop: { id: string; arriveDate: string; departDate: string } | null,
  homeEndpoint: string,
  stops: ReadonlyArray<PlanStop> = [],
): DayTransportDefaults {
  if (!stop) return {};
  const scheduled = stops
    .filter((s) => s.arriveDate != null)
    .sort((x, y) =>
      x.arriveDate! < y.arriveDate! ? -1 : x.arriveDate! > y.arriveDate! ? 1 : x.sortOrder - y.sortOrder,
    );
  const at = scheduled.findIndex((s) => s.id === stop.id);
  const previous = at > 0 ? scheduled[at - 1] : undefined;
  const next = at >= 0 ? scheduled[at + 1] : undefined;
  if (date === stop.arriveDate) return { fromStopId: previous?.id ?? homeEndpoint, toStopId: stop.id };
  if (date === stop.departDate) return { fromStopId: stop.id, toStopId: next?.id ?? homeEndpoint };
  return { fromStopId: stop.id };
}
