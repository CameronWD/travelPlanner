/**
 * Tally (TRIPS_PAGE.md §6; spec P8): Planned vs Been aggregates straight
 * from computeTravelStats. Pure.
 */
import type { TravelStats } from "@/lib/travel-stats";

export type TallyMode = "planned" | "been";
export const TALLY_MODE_KEY = "teepee:tally-mode";

export interface TallyCell {
  key: string;
  label: string;
  value: string;
}

export function formatKm(km: number, short = false): string {
  const n = Math.round(km);
  if (short && n >= 1000) return `${Math.round(n / 1000)}k km`;
  return `${n.toLocaleString("en-AU")} km`;
}

export function defaultTallyMode(hasDoneTrip: boolean): TallyMode {
  return hasDoneTrip ? "been" : "planned";
}

export function tallyFor(
  stats: TravelStats,
  mode: TallyMode,
): { countries: number; headline: [string, string]; cells: TallyCell[] } {
  const k = mode === "been" ? "done" : "planned";
  const raw: { key: string; label: string; n: number; fmt?: (n: number) => string }[] = [
    { key: "places", label: "places", n: stats.places[k] },
    { key: "nights", label: "nights away", n: stats.nightsAway[k] },
    { key: "km", label: "travelled", n: stats.distanceKm[k], fmt: (n) => formatKm(n) },
    ...(mode === "planned" ? [{ key: "booked", label: "nights booked", n: stats.accommodationNights.planned }] : []),
    { key: "flights", label: "flights", n: stats.transport.FLIGHT[k] },
    ...(mode === "planned" ? [{ key: "trains", label: "trains", n: stats.transport.TRAIN.planned }] : []),
  ];
  return {
    countries: stats.countries[k].length,
    headline: mode === "been" ? ["countries", "visited"] : ["countries", "on the list"],
    cells: raw.filter((c) => c.n > 0).map((c) => ({ key: c.key, label: c.label, value: c.fmt ? c.fmt(c.n) : String(c.n) })),
  };
}
