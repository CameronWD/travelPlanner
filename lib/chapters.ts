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
 * Order stops within a rendered chapter group as a single list by `sortOrder`
 * (the arrangement spine). For dated stops sortOrder already tracks date order —
 * firm-up flows dates forward in sortOrder and drag-reorder reflows dates to the
 * new position (ADR 0021) — so this yields chronological order for dated stops
 * while letting rough stops hold the position the traveller put them in. Pure;
 * stable via the id tiebreak. Supersedes the old dated-first / rough-after split.
 */
export function sortGroupStops<S extends StopLike & { id: string }>(stops: readonly S[]): S[] {
  return [...stops].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
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

/**
 * The dated Stops that define a chapter's date band. A dated Stop contributes to
 * chapter C when it is explicitly linked (`chapterId === C.id`) OR — when it has
 * no explicit chapterId — its arrive date falls inside C's current band. The
 * `chapterId != null → only its own chapter` rule prevents a Stop from feeding
 * two bands (which could push bands into overlap). Mirrors how the editor renders
 * a chapter's contents (ADR 0008) while still catching a just-firmed rough leg
 * whose chapter has no band yet (ADR 0009/0021). Pure.
 */
export function spanContributors<C extends ChapterLike, S extends StopLike>(
  chapter: C,
  stops: readonly S[],
  chapters: readonly C[],
): S[] {
  return stops.filter((s) => {
    if (s.arriveDate == null || s.departDate == null) return false; // rough: no span
    if (s.chapterId != null) return s.chapterId === chapter.id;
    return chapterForDate(s.arriveDate, chapters)?.id === chapter.id;
  });
}

/**
 * A dated Stop's chapter follows its dates (ADR 0008); only rough Stops can be
 * explicitly assigned to a chapter. Pure predicate — lives here (not in the
 * "use server" actions file, where every export must be an async server action).
 */
export function canAssignToChapter(stop: { arriveDate: string | null }): boolean {
  return stop.arriveDate == null;
}

