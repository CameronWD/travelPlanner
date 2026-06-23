import { isDateWithin } from "./dates";

export interface ChapterLike {
  id: string;
  name: string;
  colour: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface StopLike {
  id: string;
  arriveDate: string;
  departDate: string;
  country?: string | null;
  sortOrder: number;
}

export interface TransportLike {
  id: string;
  fromStopId?: string | null;
  toStopId?: string | null;
  depAt?: Date | string | null;
}

function sortedByStart<T extends { startDate: string }>(chapters: readonly T[]): T[] {
  return [...chapters].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function chapterForDate<T extends ChapterLike>(dateISO: string, chapters: readonly T[]): T | null {
  for (const c of sortedByStart(chapters)) {
    if (isDateWithin(dateISO, c.startDate, c.endDate)) return c;
  }
  return null;
}

export function chapterForStop<T extends ChapterLike>(stop: StopLike, chapters: readonly T[]): T | null {
  return chapterForDate(stop.arriveDate, chapters);
}

export function chaptersOverlap(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export interface ChapterGroup<C extends ChapterLike, S extends StopLike> {
  chapter: C | null;
  stops: S[];
}

export function groupStopsByChapter<C extends ChapterLike, S extends StopLike>(stops: readonly S[], chapters: readonly C[]): ChapterGroup<C, S>[] {
  const groups: ChapterGroup<C, S>[] = [];
  for (const stop of stops) {
    const chapter = chapterForStop(stop, chapters);
    const last = groups[groups.length - 1];
    const lastId = last ? (last.chapter?.id ?? null) : undefined;
    if (last && lastId === (chapter?.id ?? null)) {
      last.stops.push(stop);
    } else {
      groups.push({ chapter, stops: [stop] });
    }
  }
  return groups;
}

export function chapterIdForTransport(
  transport: TransportLike,
  chapters: readonly ChapterLike[],
  stopsById: Record<string, StopLike>,
): string | null {
  const from = transport.fromStopId ? stopsById[transport.fromStopId] : undefined;
  const to = transport.toStopId ? stopsById[transport.toStopId] : undefined;
  if (!from || !to) return null;
  const fromCh = chapterForStop(from, chapters);
  const toCh = chapterForStop(to, chapters);
  if (fromCh && toCh && fromCh.id === toCh.id) return fromCh.id;
  return null;
}

export function isTransportBetweenLegs(
  transport: TransportLike,
  chapters: readonly ChapterLike[],
  stopsById: Record<string, StopLike>,
): boolean {
  return chapterIdForTransport(transport, chapters, stopsById) === null;
}

export interface ChapterRun {
  name: string;
  startDate: string;
  endDate: string;
}

export function suggestChapterRuns(stops: readonly StopLike[]): ChapterRun[] {
  const ordered = [...stops].sort((a, b) => a.arriveDate.localeCompare(b.arriveDate));
  const runs: ChapterRun[] = [];
  let current: ChapterRun | null = null;
  let currentCountry: string | null = null;
  for (const stop of ordered) {
    const country = stop.country?.trim() || null;
    if (country && country === currentCountry && current) {
      current.endDate = stop.departDate;
    } else if (country) {
      current = { name: country, startDate: stop.arriveDate, endDate: stop.departDate };
      currentCountry = country;
      runs.push(current);
    } else {
      current = null;
      currentCountry = null;
    }
  }
  return runs;
}
