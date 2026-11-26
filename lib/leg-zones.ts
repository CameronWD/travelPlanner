export function endZones(
  t: { fromStopId?: string | null; toStopId?: string | null; depTimezone?: string | null; arrTimezone?: string | null },
  stopZone: (stopId: string | null | undefined) => string | null | undefined,
): { fromTimezone: string | null; toTimezone: string | null } {
  return {
    fromTimezone: stopZone(t.fromStopId) ?? t.depTimezone ?? null,
    toTimezone: stopZone(t.toStopId) ?? t.arrTimezone ?? null,
  };
}
