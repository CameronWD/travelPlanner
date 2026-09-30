import { nightsBetween } from "@/lib/dates";

/** The default a new rough Stop starts with. */
export const DEFAULT_ROUGH_NIGHTS = 2;

export interface RoughStopSeed {
  name: string;
  lat?: number;
  lng?: number;
  countryCode?: string;
  nights?: number;
}

export function defaultStopNights(count: number, startDate?: string, endDate?: string): number[] {
  if (count <= 0) return [];
  if (!startDate || !endDate) return Array.from({ length: count }, () => DEFAULT_ROUGH_NIGHTS);
  const total = nightsBetween(startDate, endDate);
  const base = Math.floor(total / count);
  const rem = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

export function roughStopRows(stops: RoughStopSeed[], dates: { startDate?: string; endDate?: string }) {
  const nights = defaultStopNights(stops.length, dates.startDate, dates.endDate);
  return stops.map((s, i) => ({
    forkId: null,
    name: s.name,
    country: null,
    countryCode: s.countryCode?.toLowerCase() ?? null,
    nights: s.nights ?? nights[i],
    chapterId: null,
    chapterSortOrder: 0,
    arriveDate: null,
    departDate: null,
    timezone: null,
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    notes: null,
    pinned: false,
    sortOrder: i,
  }));
}

export type RoughStopRow = ReturnType<typeof roughStopRows>[number];
