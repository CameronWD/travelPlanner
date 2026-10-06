/**
 * Day options for scheduling a Wishlist idea (spec 2026-10-05 §E) — PURE.
 *
 * An idea with coordinates near one or more of the current Plan's Stops
 * (≤ NEAR_STOP_KM, great-circle) is offered those Stops' days; otherwise
 * every Trip day, grouped by Stop. A Stop's days run arrive → depart
 * inclusive, exactly as the plan editor's day sections (`lib/stop-days.ts`),
 * so a Changeover day appears under both stays. When the nearest near Stop
 * is rough it has no days to offer — the dialog instead offers its things
 * to do (ADR 0022).
 */

import { haversineKm } from "@/lib/geo";
import { enumerateTripDays } from "@/lib/itinerary";
import { formatWeekday, parseISODate } from "@/lib/dates";

export const NEAR_STOP_KM = 50;
/** Floating-point slack so a Stop at exactly 50 km counts as within it. */
const EPSILON_KM = 1e-6;

export interface DayOptionStop {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  arriveDate: string | null;
  departDate: string | null;
}

export interface StayDays {
  stopId: string;
  stopName: string;
  /** YYYY-MM-DD, arrive → depart inclusive. */
  days: string[];
}

export interface ScheduleDayOptions {
  /** Stays offered as day chips, in date order. One per Stop — a city visited twice is two stays. */
  stays: StayDays[];
  /** True when `stays` are the Stops within NEAR_STOP_KM; false = every Trip day. */
  near: boolean;
  /** The nearest Stop within NEAR_STOP_KM when it is rough (no dates): offer its things to do. */
  roughStop: { id: string; name: string } | null;
}

type DatedStop = DayOptionStop & { arriveDate: string; departDate: string };

function isDated(s: DayOptionStop): s is DatedStop {
  return s.arriveDate != null && s.departDate != null;
}

function staysOf(stops: readonly DayOptionStop[]): StayDays[] {
  return stops
    .filter(isDated)
    .slice()
    .sort((a, b) => (a.arriveDate < b.arriveDate ? -1 : a.arriveDate > b.arriveDate ? 1 : 0))
    .map((s) => ({ stopId: s.id, stopName: s.name, days: enumerateTripDays(s.arriveDate, s.departDate) }));
}

export function scheduleDayOptions(
  idea: { lat?: number | null; lng?: number | null },
  stops: readonly DayOptionStop[],
): ScheduleDayOptions {
  const everyDay: ScheduleDayOptions = { stays: staysOf(stops), near: false, roughStop: null };
  if (idea.lat == null || idea.lng == null) return everyDay;
  const point = { lat: idea.lat, lng: idea.lng };

  const near = stops
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ stop: s, km: haversineKm(point, { lat: s.lat!, lng: s.lng! }) }))
    .filter((x) => x.km <= NEAR_STOP_KM + EPSILON_KM)
    .sort((a, b) => a.km - b.km);
  if (near.length === 0) return everyDay;

  const nearest = near[0].stop;
  return {
    stays: staysOf(near.map((x) => x.stop)),
    near: true,
    roughStop: isDated(nearest) ? null : { id: nearest.id, name: nearest.name },
  };
}

/** "Sat 19" — a day chip; the stay's name and the dialog give the month. */
export function dayChipLabel(iso: string): string {
  return `${formatWeekday(iso)} ${parseISODate(iso).getUTCDate()}`;
}
