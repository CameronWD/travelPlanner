/**
 * The Plan editor's local rows, as a pure reducer (card 2.G, spec Q7).
 *
 * Five reconciliation rules:
 *  1. Server props are adopted when no write is in flight.
 *  2. Server props that arrive while a write is in flight are held, and
 *     adopted when the last write settles.
 *  3. Props are compared by content, never by reference.
 *  4. An Undo payload carries only the Stops a write touched.
 *  5. `revert` is the one path by which local rows go back.
 *
 * Every row set the reducer stores passes through `orderPlanStops`
 * (ADR 0038; ARCH-CMP-3). The commands are pure ports of the Plan's drag,
 * assign and nights handlers: they return the optimistic rows, the request
 * to send, and the placements that put the rows back if the write fails.
 */
import type { ItineraryChapter, ItineraryStop, ItineraryTransport } from "@/components/trip/itinerary-manager";
import { addDays } from "@/lib/dates";
import { compareScheduled, orderPlanStops } from "@/lib/plan-order";
import { moveChapterBlocks, moveStopInOrder, spanReflow } from "@/lib/reorder";

export interface PlanRows { stops: ItineraryStop[]; chapters: ItineraryChapter[]; transports: ItineraryTransport[] }
export interface PlanEditorState {
  rows: PlanRows;          // what renders
  server: PlanRows;        // last server rows adopted
  pending: number;         // writes in flight
  held: PlanRows | null;   // server rows that arrived while pending (rule 2)
  newStopIds: string[];    // ids added by the last adoption (the flash)
}
/** The fields a placement write changes; what Undo writes back. */
export interface StopPlacement { id: string; sortOrder: number; chapterId: string | null; arriveDate: string | null; departDate: string | null }

export type PlanEditorEvent =
  | { type: "props"; rows: PlanRows }                                   // rules 1–3
  | { type: "begin"; rows: PlanRows }                                   // optimistic rows; pending + 1
  | { type: "settle"; rows?: PlanRows }                                 // pending − 1; rows = server-confirmed local rows (e.g. `changed` applied)
  | { type: "revert"; placements: StopPlacement[] }                     // rule 5: the one revert path
  | { type: "flashed" };                                                // clear newStopIds

type StopItem = { id: string; chapterId: string | null };

function ordered(rows: PlanRows): PlanRows {
  return { ...rows, stops: orderPlanStops(rows.stops) };
}

export function initPlanEditor(rows: PlanRows): PlanEditorState {
  return { rows: ordered(rows), server: rows, pending: 0, held: null, newStopIds: [] };
}

/** Rule 1: the props become both what renders and the server baseline. */
function adopt(state: PlanEditorState, rows: PlanRows): PlanEditorState {
  const next = ordered(rows);
  const before = new Set(state.server.stops.map((s) => s.id));
  const added = next.stops.filter((s) => !before.has(s.id)).map((s) => s.id);
  return {
    rows: next,
    server: rows,
    pending: state.pending,
    held: null,
    newStopIds: added.length > 0 ? added : state.newStopIds,
  };
}

export function planEditorReducer(state: PlanEditorState, event: PlanEditorEvent): PlanEditorState {
  switch (event.type) {
    case "props": {
      if (sameRows(event.rows, state.server)) {
        // Rule 3 — and a held snapshot the server has since walked back is stale.
        return state.held ? { ...state, held: null } : state;
      }
      if (state.pending > 0) return { ...state, held: event.rows }; // rule 2
      return adopt(state, event.rows); // rule 1
    }
    case "begin":
      return { ...state, rows: ordered(event.rows), pending: state.pending + 1 };
    case "settle": {
      const pending = Math.max(0, state.pending - 1);
      const next: PlanEditorState = { ...state, pending, rows: event.rows ? ordered(event.rows) : state.rows };
      if (pending === 0 && next.held) return adopt(next, next.held); // rule 1, applied late
      return next;
    }
    case "revert": {
      const byId = new Map(event.placements.map((p) => [p.id, p]));
      const stops = state.rows.stops
        .map((s) => {
          const p = byId.get(s.id);
          return p ? { ...s, sortOrder: p.sortOrder, chapterId: p.chapterId, arriveDate: p.arriveDate, departDate: p.departDate } : s;
        })
        .sort((a, b) => a.sortOrder - b.sortOrder);
      return { ...state, rows: { ...state.rows, stops: orderPlanStops(stops) } };
    }
    case "flashed":
      return state.newStopIds.length === 0 ? state : { ...state, newStopIds: [] };
  }
}

/** JSON with object keys sorted, so key order never reads as a change. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/**
 * Rule 3: equal by content. Compares every field of every row (so every field
 * the editor renders — a Stop's Stays and Costs, a leg's mode and places —
 * counts), never the array or object references.
 */
export function sameRows(a: PlanRows, b: PlanRows): boolean {
  if (a === b) return true;
  return canonical(a.stops) === canonical(b.stops)
    && canonical(a.chapters) === canonical(b.chapters)
    && canonical(a.transports) === canonical(b.transports);
}

function placementOf(s: StopPlacement): StopPlacement {
  return { id: s.id, sortOrder: s.sortOrder, chapterId: s.chapterId, arriveDate: s.arriveDate, departDate: s.departDate };
}

/**
 * Rule 4: the placements that turn `before` into `after` — only the Stops
 * whose sortOrder, chapter or dates differ, carrying their `after` values.
 * Pass (optimistic, current) to get what puts a write back.
 */
export function touchedPlacements(before: ItineraryStop[], after: ItineraryStop[]): StopPlacement[] {
  const prior = new Map(before.map((s) => [s.id, s]));
  const out: StopPlacement[] = [];
  for (const s of after) {
    const p = prior.get(s.id);
    if (!p) continue;
    if (p.sortOrder !== s.sortOrder || p.chapterId !== s.chapterId || p.arriveDate !== s.arriveDate || p.departDate !== s.departDate) {
      out.push(placementOf(s));
    }
  }
  return out;
}

/** Rebuild full Stops from an ordered slim list; sortOrder becomes the index, as the server writes it. */
function fromItems(stops: ItineraryStop[], items: StopItem[]): ItineraryStop[] {
  const byId = new Map(stops.map((s) => [s.id, s]));
  return items.map((slim, idx) => ({ ...byId.get(slim.id)!, chapterId: slim.chapterId, sortOrder: idx }));
}

/**
 * The server's span reflow (reflowSpanTx, ADR 0038) predicted locally, so a
 * scheduled drop keeps its new place under `orderPlanStops` until the
 * confirmed `changed` dates arrive.
 */
function predictReflow(stops: ItineraryStop[], movedIds: ReadonlySet<string>): ItineraryStop[] {
  const newScheduled = stops
    .filter((s): s is ItineraryStop & { arriveDate: string; departDate: string } => s.arriveDate != null && s.departDate != null)
    .map((s) => ({ id: s.id, sortOrder: s.sortOrder, arriveDate: s.arriveDate, departDate: s.departDate, pinned: s.pinned }));
  const oldScheduled = [...newScheduled].sort(compareScheduled);
  const { results } = spanReflow(oldScheduled, newScheduled, movedIds);
  const byId = new Map(results.filter((r) => r.changed).map((r) => [r.id, r]));
  return stops.map((s) => {
    const r = byId.get(s.id);
    return r ? { ...s, arriveDate: r.arriveDate, departDate: r.departDate } : s;
  });
}

function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * A Stop drag (handleDragEnd's stop branch). `chapterId` is the drop
 * container the caller resolved from `over` (null = ungrouped); when `overId`
 * is a Stop, that Stop's chapter wins, as before. Null when the handler bailed:
 * unknown Stop, pinned scheduled Stop (the caller toasts), scheduled self-drop,
 * or a rough Stop into a dated chapter.
 */
export function reorderCommand(state: PlanEditorState, a: { activeId: string; overId: string; chapterId: string | null }):
  { rows: PlanRows; request: { items: { id: string; chapterId: string | null }[]; movedStopIds: string[] }; before: StopPlacement[] } | null {
  const { activeId, overId } = a;
  const stops = state.rows.stops;
  const activeStop = stops.find((s) => s.id === activeId);
  if (!activeStop) return null;
  const activeIsScheduled = activeStop.arriveDate !== null;
  if (activeIsScheduled && activeStop.pinned) return null;
  if (activeIsScheduled && activeId === overId) return null;

  const overStop = stops.find((s) => s.id === overId);
  const targetChapterId: string | null = overStop ? overStop.chapterId : a.chapterId;

  const targetChapter = targetChapterId ? state.rows.chapters.find((c) => c.id === targetChapterId) : null;
  if (!activeIsScheduled && targetChapter && targetChapter.startDate !== null) return null;

  let items: StopItem[];
  if (activeIsScheduled) {
    // moveStopInOrder pins dated stops in place, so reorder the full list:
    // pull the active stop out and reinsert it at the drop target.
    const working = stops.map((s) => ({ id: s.id, chapterId: s.chapterId }));
    working.splice(working.findIndex((s) => s.id === activeId), 1);
    let insertAt = overStop ? working.findIndex((s) => s.id === overId) : -1;
    if (insertAt === -1) {
      const lastInTarget = working
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.chapterId === targetChapterId)
        .pop();
      insertAt = lastInTarget ? lastInTarget.i + 1 : working.length;
    }
    working.splice(insertAt, 0, { id: activeId, chapterId: targetChapterId });
    items = working;
  } else {
    const containerStops = stops.filter((s) => s.arriveDate === null && s.chapterId === targetChapterId);
    let targetIndex = containerStops.length;
    if (overStop && overStop.arriveDate === null && overStop.chapterId === targetChapterId) {
      const overIdx = containerStops.findIndex((s) => s.id === overId);
      if (overIdx !== -1) targetIndex = overIdx;
    }
    items = moveStopInOrder(stops, activeId, targetChapterId, targetIndex);
  }

  let next = fromItems(stops, items);
  if (activeIsScheduled) next = predictReflow(next, new Set([activeId]));
  next = orderPlanStops(next);
  return {
    rows: { ...state.rows, stops: next },
    request: { items, movedStopIds: [activeId] },
    before: touchedPlacements(next, stops),
  };
}

/**
 * A chapter drag (handleDragEnd's chapter branch). Rough chapter: permute the
 * rough blocks, then reorderChapters(rough ids) and reorderStops(stopItems).
 * Dated chapter: move it among every chapter and let reorderChapters rebuild
 * the stop order (stopItems null; stops stay until the server answers).
 */
export function reorderChaptersCommand(state: PlanEditorState, a: { activeId: string; overId: string }):
  { rows: PlanRows; request: { chapterIds: string[]; movedChapterId: string; stopItems: { id: string; chapterId: string | null }[] | null }; before: StopPlacement[] } | null {
  const { activeId, overId } = a;
  if (activeId === overId) return null;
  const chapters = state.rows.chapters;
  const activeChapter = chapters.find((c) => c.id === activeId);
  if (!activeChapter) return null;

  if (activeChapter.startDate === null) {
    const roughChapters = chapters.filter((c) => c.startDate === null);
    const oldIndex = roughChapters.findIndex((c) => c.id === activeId);
    const newIndex = roughChapters.findIndex((c) => c.id === overId);
    if (oldIndex === -1 || newIndex === -1) return null;
    const reorderedRough = arrayMove(roughChapters, oldIndex, newIndex);
    const datedChapters = chapters.filter((c) => c.startDate !== null);
    const roughChapterIds = reorderedRough.map((c) => c.id);
    const stopItems = moveChapterBlocks(state.rows.stops, chapters, roughChapterIds);
    const stops = orderPlanStops(fromItems(state.rows.stops, stopItems));
    return {
      rows: { ...state.rows, chapters: [...datedChapters, ...reorderedRough], stops },
      request: { chapterIds: roughChapterIds, movedChapterId: activeId, stopItems },
      before: touchedPlacements(stops, state.rows.stops),
    };
  }

  const oldIndex = chapters.findIndex((c) => c.id === activeId);
  const newIndex = chapters.findIndex((c) => c.id === overId);
  if (oldIndex === -1 || newIndex === -1) return null;
  const nextChapters = arrayMove(chapters, oldIndex, newIndex);
  return {
    rows: { ...state.rows, chapters: nextChapters },
    request: { chapterIds: nextChapters.map((c) => c.id), movedChapterId: activeId, stopItems: null },
    before: [],
  };
}

/** Assign a Stop to a chapter, or to none (handleAssign). */
export function assignChapterCommand(state: PlanEditorState, a: { stopId: string; chapterId: string | null }): { rows: PlanRows; before: StopPlacement[] } {
  const stops = state.rows.stops;
  const next = orderPlanStops(stops.map((s) => (s.id === a.stopId ? { ...s, chapterId: a.chapterId } : s)));
  return { rows: { ...state.rows, stops: next }, before: touchedPlacements(next, stops) };
}

/** −/+ nights (handleSetNights): a scheduled Stop moves its depart date; a rough Stop writes nights. */
export function setNightsCommand(state: PlanEditorState, a: { stopId: string; nights: number }): { rows: PlanRows; before: StopPlacement[] } {
  const stops = state.rows.stops;
  const next = orderPlanStops(
    stops.map((s) =>
      s.id !== a.stopId ? s : s.arriveDate ? { ...s, departDate: addDays(s.arriveDate, a.nights) } : { ...s, nights: a.nights },
    ),
  );
  return { rows: { ...state.rows, stops: next }, before: touchedPlacements(next, stops) };
}

/** The server's reflowed dates (a write's `changed`), applied in plan order. */
export function applyChanged(rows: PlanRows, changed: { id: string; arriveDate: string; departDate: string }[]): PlanRows {
  if (changed.length === 0) return rows;
  const byId = new Map(changed.map((c) => [c.id, c]));
  return {
    ...rows,
    stops: orderPlanStops(rows.stops.map((s) => {
      const c = byId.get(s.id);
      return c ? { ...s, arriveDate: c.arriveDate, departDate: c.departDate } : s;
    })),
  };
}
