import { isDateWithin } from "./dates";

export interface ChapterLike {
  id: string;
  name: string;
  colour: string;
  startDate: string | null; // YYYY-MM-DD; null for rough (date-less) chapters
  endDate: string | null;   // YYYY-MM-DD; null for rough (date-less) chapters
  sortOrder?: number;
}

export interface StopLike {
  id: string;
  arriveDate: string | null; // null while the stop is rough
  departDate: string | null;
  nights?: number | null;
  chapterId?: string | null; // explicit membership while rough
  country?: string | null;
  sortOrder: number;
}

export interface TransportLike {
  id: string;
  fromStopId?: string | null;
  toStopId?: string | null;
  depAt?: Date | string | null;
}

export function sortedByStart<T extends { startDate: string | null; sortOrder?: number }>(chapters: readonly T[]): T[] {
  return [...chapters].sort((a, b) => {
    const aDated = a.startDate != null;
    const bDated = b.startDate != null;
    if (aDated && bDated) return a.startDate!.localeCompare(b.startDate!);
    if (aDated !== bDated) return aDated ? -1 : 1; // dated first, rough after
    // both rough: explicit sortOrder
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

export function chapterForDate<T extends ChapterLike>(dateISO: string, chapters: readonly T[]): T | null {
  for (const c of sortedByStart(chapters)) {
    if (c.startDate && c.endDate && isDateWithin(dateISO, c.startDate, c.endDate)) return c;
  }
  return null;
}

export function chapterForStop<T extends ChapterLike>(stop: StopLike, chapters: readonly T[]): T | null {
  // Rough stop: explicit membership by chapterId.
  if (!stop.arriveDate) {
    return stop.chapterId ? (chapters.find((c) => c.id === stop.chapterId) ?? null) : null;
  }
  // Scheduled stop: ADR 0008 date-band membership (ignores chapterId).
  return chapterForDate(stop.arriveDate, chapters);
}

export function chaptersOverlap(
  a: { startDate: string | null; endDate: string | null },
  b: { startDate: string | null; endDate: string | null },
): boolean {
  // A rough (date-less) chapter occupies no calendar range, so it can't overlap.
  if (!a.startDate || !a.endDate || !b.startDate || !b.endDate) return false;
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

/**
 * Order stops within a rendered chapter group: dated stops by arrive date
 * (their source of truth), then rough stops by explicit sortOrder. Pure.
 */
export function sortGroupStops<S extends StopLike>(stops: readonly S[]): S[] {
  const dated = stops
    .filter((s) => s.arriveDate != null)
    .sort((a, b) => (a.arriveDate as string).localeCompare(b.arriveDate as string) || a.sortOrder - b.sortOrder);
  const rough = stops
    .filter((s) => s.arriveDate == null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return [...dated, ...rough];
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

