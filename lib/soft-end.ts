/**
 * The soft end date (CONTEXT.md **Trip**, **Hard end date**; spec
 * 2026-10-16 F4): the later of the last scheduled Stop's depart and the day
 * the return leg lands — read in the Home base's zone — so a Trip ends the
 * day you are back. Pure; `server/actions/trip-window.ts` stores it, only
 * ever growing `Trip.endDate`.
 *
 * The return leg here is every dated leg that is Home-bound (`arrIsHome`) or
 * has `findReturnLeg`'s shape (departs the last plan Stop, arrives at no
 * Stop); the LATEST landing wins — on a multi-leg journey home you are back
 * when the last one lands. (The Hard end date's deadline, ADR 0068, is the
 * mirror image — the earliest departure — and is untouched.) Each landing is
 * read in its arrival zone by the same rule the write path and the leg card
 * use (`resolveEndpointZones`), so the window grows to the date the
 * Traveller sees on the card.
 */
import { lastPlanStop } from "@/lib/trip-deadline";
import { resolveEndpointZones } from "@/lib/time-display";
import { instantToZonedDateISO } from "@/lib/tz";

export interface SoftEndStop {
  id: string;
  sortOrder: number;
  arriveDate: string | null;
  departDate: string | null;
  timezone: string | null;
}

export interface SoftEndLeg {
  fromStopId: string | null;
  toStopId: string | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  arrAt: Date | string | null;
}

const later = (a: string | null, b: string): string => (a === null || b > a ? b : a);

export function softEndDate(input: {
  stops: readonly SoftEndStop[];
  transports: readonly SoftEndLeg[];
  homeTimezone: string | null;
}): string | null {
  let end: string | null = null;
  for (const s of input.stops) {
    if (s.arriveDate && s.departDate) end = later(end, s.departDate);
  }
  const lastId = lastPlanStop(input.stops)?.id ?? null;
  const zoneOf = new Map(input.stops.map((s) => [s.id, s.timezone]));
  for (const leg of input.transports) {
    if (!leg.arrAt) continue;
    const returnShape = lastId !== null && leg.fromStopId === lastId && !leg.toStopId;
    if (!leg.arrIsHome && !returnShape) continue;
    const instant = leg.arrAt instanceof Date ? leg.arrAt : new Date(leg.arrAt);
    if (Number.isNaN(instant.getTime())) continue;
    const { arrTz } = resolveEndpointZones(
      leg.fromStopId ? zoneOf.get(leg.fromStopId) ?? null : null,
      null,
      { depIsHome: leg.depIsHome, arrIsHome: leg.arrIsHome, homeTimezone: input.homeTimezone },
    );
    end = later(end, instantToZonedDateISO(instant, arrTz));
  }
  return end;
}

/** The end date to store: `soft` when it is later than `current`, else null (never shrinks). */
export function grownEndDate(current: string | null, soft: string | null): string | null {
  return soft !== null && (current === null || soft > current) ? soft : null;
}
