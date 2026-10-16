/**
 * Home timezone change keeps Home-end local times (ADR 0030 amendment
 * 2026-10-16, spec 2026-10-16 F5). A Transport end's time is typed as a local
 * wall-clock time off a ticket and stored as an instant read in that end's
 * zone (lib/wall-time.ts). When the Trip's Home zone changes, every end whose
 * zone follows it keeps the local time it showed; only the instant moves.
 *
 * "Whose zone follows it" is decided by resolveEndpointZones, the one rule
 * the write path and every display share: an end is re-filed exactly when
 * the zone it was typed in and the zone it is now shown in differ.
 */
import { resolveEndpointZones } from "@/lib/time-display";
import { instantToZonedDateISO, instantToZonedTime, zonedWallTimeToInstant } from "@/lib/tz";

export interface HomeLeg {
  id: string;
  depAt: Date | null;
  arrAt: Date | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  /** The departure Stop's zone (null: no Stop, or a rough Stop). */
  fromTimezone: string | null;
  /** The arrival Stop's zone. */
  toTimezone: string | null;
}

/** Only the ends that moved are present. */
export interface RefiledLeg { id: string; depAt?: Date; arrAt?: Date }

/** The instant showing the same local date and HH:MM in `toZone` as `instant` shows in `fromZone`. */
export function keepWallTime(instant: Date, fromZone: string, toZone: string): Date {
  if (fromZone === toZone) return instant;
  return zonedWallTimeToInstant(
    instantToZonedDateISO(instant, fromZone),
    instantToZonedTime(instant, fromZone),
    toZone,
  );
}

function moved(instant: Date | null, fromZone: string, toZone: string): Date | undefined {
  if (!instant) return undefined;
  const next = keepWallTime(instant, fromZone, toZone);
  return next.getTime() === instant.getTime() ? undefined : next;
}

/** The legs whose stored instants change when the Home zone goes from `oldHomeTimezone` to `newHomeTimezone`. */
export function refileHomeEnds(
  legs: HomeLeg[],
  oldHomeTimezone: string | null,
  newHomeTimezone: string | null,
): RefiledLeg[] {
  const out: RefiledLeg[] = [];
  for (const leg of legs) {
    const flags = { depIsHome: leg.depIsHome, arrIsHome: leg.arrIsHome };
    const before = resolveEndpointZones(leg.fromTimezone, leg.toTimezone, { ...flags, homeTimezone: oldHomeTimezone });
    const after = resolveEndpointZones(leg.fromTimezone, leg.toTimezone, { ...flags, homeTimezone: newHomeTimezone });
    const depAt = moved(leg.depAt, before.depTz, after.depTz);
    const arrAt = moved(leg.arrAt, before.arrTz, after.arrTz);
    if (depAt || arrAt) out.push({ id: leg.id, ...(depAt ? { depAt } : {}), ...(arrAt ? { arrAt } : {}) });
  }
  return out;
}
