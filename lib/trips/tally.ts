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

/**
 * Never show "0 countries": if the wanted mode has no countries but the
 * other mode has some, fall back to the other mode. If both are empty (or
 * the wanted mode already has some), the wanted mode stands — callers render
 * "—" for a still-zero countries count rather than picking a mode with cells
 * but no countries.
 */
export function effectiveTallyMode(stats: TravelStats, wanted: TallyMode): TallyMode {
  const other: TallyMode = wanted === "been" ? "planned" : "been";
  const wantedK = wanted === "been" ? "done" : "planned";
  const otherK = other === "been" ? "done" : "planned";
  if (stats.countries[wantedK].length === 0 && stats.countries[otherK].length > 0) return other;
  return wanted;
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
