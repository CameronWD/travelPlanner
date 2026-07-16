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

/** A chapter positioned in the plan, before seam-trimming and final output. */
export interface PlacedChapter {
  name: string;
  startDate: string;
  endDate: string;
  anchorCity: string;
}

function standalone(r: CountryRun): PlacedChapter {
  return { name: r.country, startDate: r.startDate, endDate: r.endDate, anchorCity: r.anchorCity };
}

/**
 * Turn runs + zone intervals into positioned chapters, left to right. Runs
 * outside any zone become standalone country chapters. Each zone becomes a
 * combined chapter over its core, with substantial (>= SUBSTANTIAL_STAY_NIGHTS,
 * run-total) single-country runs at the zone's FRONT or BACK peeled off as
 * their own chapters.
 */
export function buildChapters(
  runs: readonly CountryRun[],
  intervals: readonly [number, number][],
): PlacedChapter[] {
  const zoneStartToEnd = new Map<number, number>();
  for (const [start, end] of intervals) zoneStartToEnd.set(start, end);

  const out: PlacedChapter[] = [];
  let i = 0;
  while (i < runs.length) {
    const end = zoneStartToEnd.get(i);
    if (end === undefined) {
      out.push(standalone(runs[i]));
      i += 1;
    } else {
      out.push(...buildZoneChapters(runs.slice(i, end + 1)));
      i = end + 1;
    }
  }
  return out;
}

/** Edge-peel a single zone into [leftPeeled..., core?, rightPeeled...]. */
function buildZoneChapters(zoneRuns: readonly CountryRun[]): PlacedChapter[] {
  let left = 0;
  let right = zoneRuns.length - 1;
  const leftPeeled: PlacedChapter[] = [];
  const rightPeeled: PlacedChapter[] = [];

  while (left <= right && zoneRuns[left].nights >= SUBSTANTIAL_STAY_NIGHTS) {
    leftPeeled.push(standalone(zoneRuns[left]));
    left += 1;
  }
  while (right >= left && zoneRuns[right].nights >= SUBSTANTIAL_STAY_NIGHTS) {
    rightPeeled.push(standalone(zoneRuns[right]));
    right -= 1;
  }

  const core: PlacedChapter[] = [];
  if (left <= right) {
    const coreRuns = zoneRuns.slice(left, right + 1);
    core.push({
      name: combineName(coreRuns.map((r) => r.country)),
      startDate: coreRuns[0].startDate,
      endDate: coreRuns[coreRuns.length - 1].endDate,
      anchorCity: coreRuns[0].anchorCity,
    });
  }

  return [...leftPeeled, ...core, ...rightPeeled.reverse()];
}
