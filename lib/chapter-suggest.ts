import { addDays, nightsBetween } from "./dates";
import type { ChapterRun } from "./chapters";

/**
 * A dated Stop as consumed by the chapter suggester. Only stops with BOTH
 * arriveDate AND departDate are considered; a country-less stop breaks a run.
 */
export interface SuggestStop {
  name: string;
  arriveDate: string | null;
  departDate: string | null;
  country: string | null;
}

/** A maximal run of consecutive same-country dated stops. */
export interface CountryRun {
  country: string;
  anchorCity: string; // first stop's name — used only for name disambiguation
  startDate: string; // first stop's arriveDate
  endDate: string; // last stop's departDate
  nights: number; // run-total nights = nightsBetween(startDate, endDate)
}

/** Nights at or above this (run-total) let an edge run stand as its own chapter. */
export const SUBSTANTIAL_STAY_NIGHTS = 5;

/**
 * Build a combined-chapter name from the countries in it, de-duplicated
 * preserving first-appearance order:
 *   1  → "Germany"
 *   2  → "Germany & France"
 *   3  → "Germany, France & Switzerland"
 *   4+ → "Multi-country leg"
 */
export function combineName(countries: readonly string[]): string {
  const unique: string[] = [];
  for (const c of countries) if (!unique.includes(c)) unique.push(c);
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} & ${unique[1]}`;
  if (unique.length === 3) return `${unique[0]}, ${unique[1]} & ${unique[2]}`;
  return "Multi-country leg";
}

/**
 * Group dated stops into maximal runs of consecutive same-country stops, in
 * date order. Stops missing arrive/depart or country are skipped and break the
 * current run (they stay Ungrouped). Mirrors the run-building the previous
 * suggester used, but also carries run-total nights and an anchor city.
 */
export function countryRuns(stops: readonly SuggestStop[]): CountryRun[] {
  const dated = stops.filter(
    (s): s is SuggestStop & { arriveDate: string; departDate: string } =>
      s.arriveDate !== null && s.departDate !== null,
  );
  const ordered = [...dated].sort((a, b) => a.arriveDate.localeCompare(b.arriveDate));

  const runs: CountryRun[] = [];
  let current: CountryRun | null = null;
  let currentCountry: string | null = null;

  for (const stop of ordered) {
    const country = stop.country?.trim() || null;
    if (country && country === currentCountry && current) {
      current.endDate = stop.departDate;
      current.nights = nightsBetween(current.startDate, current.endDate);
    } else if (country) {
      current = {
        country,
        anchorCity: stop.name,
        startDate: stop.arriveDate,
        endDate: stop.departDate,
        nights: nightsBetween(stop.arriveDate, stop.departDate),
      };
      currentCountry = country;
      runs.push(current);
    } else {
      current = null;
      currentCountry = null;
    }
  }
  return runs;
}

/**
 * Index intervals of the interleaved zones — contiguous stretches of runs
 * within which a country recurs. A country appearing in more than one run
 * (necessarily non-adjacent, since runs are maximal) forces the span between
 * its first and last run into one zone; spans that share an index merge, but
 * spans that merely touch at a boundary (a clean gap between two tangles) do
 * not. Returns sorted, disjoint inclusive [startIdx, endIdx] pairs.
 */
export function zoneIntervals(runs: readonly CountryRun[]): [number, number][] {
  const firstIdx = new Map<string, number>();
  const lastIdx = new Map<string, number>();
  runs.forEach((r, i) => {
    if (!firstIdx.has(r.country)) firstIdx.set(r.country, i);
    lastIdx.set(r.country, i);
  });

  const spans: [number, number][] = [];
  for (const [country, first] of firstIdx) {
    const last = lastIdx.get(country)!;
    if (last > first) spans.push([first, last]);
  }
  spans.sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const [start, end] of spans) {
    const prev = merged[merged.length - 1];
    if (prev && start <= prev[1]) {
      prev[1] = Math.max(prev[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}
