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
