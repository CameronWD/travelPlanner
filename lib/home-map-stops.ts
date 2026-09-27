/**
 * Shapes the Home's plan Stops for the desktop Route map tile: located Stops
 * only, numbered by their position in canonical plan order (the same number
 * the Plan shows), in the Stop's own colour (lib/stop-colours, by sortOrder —
 * the calendar's rule), with the inset-card line "4 nights · then Paris".
 * PURE.
 */
import { formatNights, nightsBetween } from "@/lib/dates";
import { stopHue } from "@/lib/stop-colours";
import type { Hue } from "@/lib/hues";

export interface HomeMapStopInput {
  id: string;
  name: string;
  sortOrder: number;
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
  arriveDate: string | null;
  departDate: string | null;
  nights: number | null;
}

export interface HomeMapStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  countryCode: string | null;
  nights: number;
  stopColour: Hue;
  number: number;
  nextLine: string;
}

/** `planStops` must already be in canonical plan order (orderPlanStops). */
export function buildHomeMapStops(planStops: HomeMapStopInput[]): HomeMapStop[] {
  const out: HomeMapStop[] = [];
  planStops.forEach((s, i) => {
    if (s.lat == null || s.lng == null) return;
    const dated = s.arriveDate != null && s.departDate != null;
    const nights = dated ? nightsBetween(s.arriveDate!, s.departDate!) : (s.nights ?? 0);
    const next = planStops[i + 1];
    const nightsLabel = formatNights(nights, { rough: !dated });
    out.push({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      countryCode: s.countryCode,
      nights,
      stopColour: stopHue(s.sortOrder),
      number: i + 1,
      nextLine: next ? `${nightsLabel} · then ${next.name}` : nightsLabel,
    });
  });
  return out;
}
