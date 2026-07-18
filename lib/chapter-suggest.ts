import { addDays, nightsBetween } from "./dates";
import type { ChapterRun } from "./chapters";
import { countryName } from "./countries";

/**
 * A dated Stop as consumed by the chapter suggester. Only stops with BOTH
 * arriveDate AND departDate are considered; a countryCode-less stop breaks a run.
 */
export interface SuggestStop {
  name: string;
  arriveDate: string | null;
  departDate: string | null;
  countryCode: string | null;
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
  let currentCountryCode: string | null = null;

  for (const stop of ordered) {
    const code = stop.countryCode?.trim() || null;
    if (code && code === currentCountryCode && current) {
      current.endDate = stop.departDate;
      current.nights = nightsBetween(current.startDate, current.endDate);
    } else if (code) {
      current = {
        country: countryName(code),
        anchorCity: stop.name,
        startDate: stop.arriveDate,
        endDate: stop.departDate,
        nights: nightsBetween(stop.arriveDate, stop.departDate),
      };
      currentCountryCode = code;
      runs.push(current);
    } else {
      current = null;
      currentCountryCode = null;
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

/**
 * Append the anchor city to every chapter in any group that shares an exact
 * name (e.g. two "France" bands from a double edge-peel → "France (Paris)" and
 * "France (Lyon)"). A solo + combined pair ("France" vs "Germany & France") is
 * not an exact clash and is left alone.
 */
export function disambiguateNames(chapters: readonly PlacedChapter[]): PlacedChapter[] {
  const counts = new Map<string, number>();
  for (const c of chapters) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  return chapters.map((c) =>
    (counts.get(c.name) ?? 0) > 1 ? { ...c, name: `${c.name} (${c.anchorCity})` } : c,
  );
}

/**
 * Suggest chapters for a Trip's dated stops (see ADR 0008 and ADR 0034). Clean,
 * unique-country blocks become one chapter each; an interleaved stretch becomes
 * a single combined chapter (with substantial edge stays peeled off). Adjacent
 * bands are seam-trimmed so they never share a boundary day — chaptersOverlap
 * is inclusive and stops hand off arrive == previous depart.
 */
export function suggestChapters(stops: readonly SuggestStop[]): ChapterRun[] {
  const runs = countryRuns(stops);
  const placed = disambiguateNames(buildChapters(runs, zoneIntervals(runs)));

  for (let i = 0; i < placed.length - 1; i++) {
    if (placed[i].endDate >= placed[i + 1].startDate) {
      const trimmed = addDays(placed[i + 1].startDate, -1);
      placed[i].endDate = trimmed >= placed[i].startDate ? trimmed : placed[i].startDate;
    }
  }

  return placed.map((c) => ({ name: c.name, startDate: c.startDate, endDate: c.endDate }));
}
