import { describe, it, expect } from "vitest";
import { stop, chapter, type StopRow, type ChapterRow } from "@/test/builders";
import type { ItineraryChapter, ItineraryStop } from "@/components/trip/itinerary-manager";
import {
  applyChanged,
  assignChapterCommand,
  initPlanEditor,
  planEditorReducer,
  reorderChaptersCommand,
  reorderCommand,
  sameRows,
  setNightsCommand,
  touchedPlacements,
  type PlanRows,
} from "./plan-editor-state";

function itineraryStop(o: Partial<StopRow> = {}): ItineraryStop {
  const s = stop(o);
  return {
    id: s.id, name: s.name, country: s.country, timezone: s.timezone, arriveDate: s.arriveDate, departDate: s.departDate,
    nights: s.nights, pinned: s.pinned, chapterId: s.chapterId, notes: s.notes, lat: s.lat, lng: s.lng,
    sortOrder: s.sortOrder, surprise: null, chapterSortOrder: s.chapterSortOrder, accommodations: [],
  };
}
function itineraryChapter(o: Partial<ChapterRow> = {}): ItineraryChapter {
  const c = chapter(o);
  return { id: c.id, name: c.name, colour: c.colour, startDate: c.startDate, endDate: c.endDate, sortOrder: c.sortOrder };
}
function rough(id: string, sortOrder: number, chapterId: string | null = null): ItineraryStop {
  return itineraryStop({ id, name: id, sortOrder, chapterId, arriveDate: null, departDate: null, timezone: null, nights: 2 });
}
function rows(stops: ItineraryStop[], chapters: ItineraryChapter[] = []): PlanRows {
  return { stops, chapters, transports: [] };
}
const ids = (s: { id: string }[]) => s.map((x) => x.id);

// Scheduled a (1–4 Nov) then b (4–6 Nov).
const sa = itineraryStop({ id: "a", name: "Lisbon", sortOrder: 0, arriveDate: "2026-11-01", departDate: "2026-11-04" });
const sb = itineraryStop({ id: "b", name: "Porto", sortOrder: 1, arriveDate: "2026-11-04", departDate: "2026-11-06" });
const rowsAB = rows([sa, sb]);
// b moved first: the reflowed dates (b 1–3 Nov, a 3–6 Nov) with the new sortOrders.
const rowsBA = rows([
  { ...sb, sortOrder: 0, arriveDate: "2026-11-01", departDate: "2026-11-03" },
  { ...sa, sortOrder: 1, arriveDate: "2026-11-03", departDate: "2026-11-06" },
]);
const rowsAB_withRename = rows([{ ...sa, name: "Renamed" }, sb]);

const stopsABC = [rough("a", 0), rough("b", 1), rough("c", 2)];
const stopsACB = [rough("a", 0), { ...rough("c", 2), sortOrder: 1 }, { ...rough("b", 1), sortOrder: 2 }];

describe("planEditorReducer — the Q7 reconciliation rules", () => {
  it("holds server rows that arrive mid-write and adopts them when idle (CMP-1, Review Focus 1)", () => {
    let s = initPlanEditor(rowsAB);
    s = planEditorReducer(s, { type: "begin", rows: rowsBA });
    s = planEditorReducer(s, { type: "props", rows: rowsAB_withRename });
    expect(s.rows.stops.map((x) => x.id)).toEqual(["b", "a"]);
    s = planEditorReducer(s, { type: "settle" });
    expect(s.rows.stops.find((x) => x.id === "a")!.name).toBe("Renamed");
  });

  it("ignores fresh-reference props with the same content", () => {
    const s = initPlanEditor(rowsAB);
    expect(planEditorReducer(s, { type: "props", rows: structuredClone(rowsAB) })).toBe(s);
  });

  it("adopts changed props when idle, in plan order, flashing only the added stops", () => {
    const s0 = initPlanEditor(rowsAB);
    const sc = itineraryStop({ id: "c", name: "Faro", sortOrder: 2, arriveDate: "2026-10-28", departDate: "2026-11-01" });
    const s = planEditorReducer(s0, { type: "props", rows: rows([sa, sb, sc]) });
    expect(ids(s.rows.stops)).toEqual(["c", "a", "b"]);
    expect(ids(s.server.stops)).toEqual(["a", "b", "c"]);
    expect(s.newStopIds).toEqual(["c"]);
    expect(planEditorReducer(s, { type: "flashed" }).newStopIds).toEqual([]);
  });

  it("drops a held snapshot when the server comes back to what is already adopted", () => {
    let s = initPlanEditor(rowsAB);
    s = planEditorReducer(s, { type: "begin", rows: rowsBA });
    s = planEditorReducer(s, { type: "props", rows: rowsAB_withRename });
    s = planEditorReducer(s, { type: "props", rows: structuredClone(rowsAB) });
    expect(s.held).toBeNull();
    s = planEditorReducer(s, { type: "settle" });
    expect(ids(s.rows.stops)).toEqual(["b", "a"]);
  });

  it("settle with rows applies the server-confirmed local rows, in plan order", () => {
    let s = planEditorReducer(initPlanEditor(rowsAB), { type: "begin", rows: rowsAB });
    s = planEditorReducer(s, { type: "settle", rows: applyChanged(s.rows, [
      { id: "a", arriveDate: "2026-11-05", departDate: "2026-11-07" },
    ]) });
    expect(s.pending).toBe(0);
    expect(ids(s.rows.stops)).toEqual(["b", "a"]);
  });

  it("touchedPlacements keeps only moved rows (CMP-2, Review Focus 2)", () => {
    expect(touchedPlacements(stopsABC, stopsACB).map((p) => p.id).sort()).toEqual(["b", "c"]);
  });

  it("revert puts rows back in plan order (CMP-3)", () => {
    const s = planEditorReducer(initPlanEditor(rowsAB), { type: "begin", rows: rowsBA });
    const r = planEditorReducer(s, { type: "revert", restore: { placements: touchedPlacements(rowsBA.stops, rowsAB.stops) } });
    expect(r.rows.stops.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("a failed write while a snapshot is held: revert, then settle adopts the held rows", () => {
    let s = initPlanEditor(rowsAB);
    s = planEditorReducer(s, { type: "begin", rows: rowsBA });
    s = planEditorReducer(s, { type: "props", rows: rowsAB_withRename });
    s = planEditorReducer(s, { type: "revert", restore: { placements: touchedPlacements(rowsBA.stops, rowsAB.stops) } });
    expect(ids(s.rows.stops)).toEqual(["a", "b"]);
    expect(s.rows.stops[0].name).toBe("Lisbon");
    s = planEditorReducer(s, { type: "settle" });
    expect(s.pending).toBe(0);
    expect(s.held).toBeNull();
    expect(s.rows.stops[0].name).toBe("Renamed");
  });

  it("overlapping writes adopt the held rows only when the last one settles", () => {
    let s = initPlanEditor(rowsAB);
    s = planEditorReducer(s, { type: "begin", rows: rowsBA });
    s = planEditorReducer(s, { type: "begin", rows: rowsBA });
    s = planEditorReducer(s, { type: "props", rows: rowsAB_withRename });
    s = planEditorReducer(s, { type: "settle" });
    expect(s.pending).toBe(1);
    expect(ids(s.rows.stops)).toEqual(["b", "a"]);
    expect(s.held).not.toBeNull();
    s = planEditorReducer(s, { type: "settle" });
    expect(s.pending).toBe(0);
    expect(ids(s.rows.stops)).toEqual(["a", "b"]);
    expect(s.rows.stops[0].name).toBe("Renamed");
  });

  it("sameRows compares by content, not reference", () => {
    expect(sameRows(rowsAB, structuredClone(rowsAB))).toBe(true);
    expect(sameRows(rowsAB, rowsAB_withRename)).toBe(false);
    expect(sameRows(rowsAB, rows([sa, { ...sb, pinned: true }]))).toBe(false);
  });
});

describe("reorderCommand (ported from handleDragEnd's stop drag)", () => {
  it("blocks dragging a pinned scheduled stop (was the handler-capture toast test)", () => {
    const s = initPlanEditor(rows([{ ...sa, pinned: true }, sb]));
    expect(reorderCommand(s, { activeId: "a", overId: "b", chapterId: null })).toBeNull();
  });

  it("does not block a scheduled stop that is not pinned, and asks for the reflow", () => {
    const s = initPlanEditor(rowsAB);
    const cmd = reorderCommand(s, { activeId: "b", overId: "a", chapterId: null })!;
    expect(cmd.request).toEqual({ items: [{ id: "b", chapterId: null }, { id: "a", chapterId: null }], movedStopIds: ["b"] });
    // The optimistic rows predict the server's span reflow, so plan order keeps the drop.
    expect(ids(cmd.rows.stops)).toEqual(["b", "a"]);
    expect(cmd.rows.stops.map((x) => [x.arriveDate, x.departDate])).toEqual([
      ["2026-11-01", "2026-11-03"], ["2026-11-03", "2026-11-06"],
    ]);
    expect(ids(cmd.before.placements).sort()).toEqual(["a", "b"]);
    expect(cmd.before.placements.find((p) => p.id === "b")).toEqual({
      id: "b", sortOrder: 1, chapterId: null, arriveDate: "2026-11-04", departDate: "2026-11-06",
    });
  });

  it("a blocked pinned drag leaves chapterId alone for the next drag's request (regression, ADR 0038)", () => {
    const chB = itineraryChapter({ id: "chB", startDate: "2026-11-04", endDate: "2026-11-06" });
    const s = initPlanEditor(rows([{ ...sa, pinned: true }, { ...sb, chapterId: "chB" }], [chB]));
    expect(reorderCommand(s, { activeId: "a", overId: "chB", chapterId: "chB" })).toBeNull();
    const cmd = reorderCommand(s, { activeId: "b", overId: "a", chapterId: null })!;
    expect(cmd.request.items.find((i) => i.id === "a")!.chapterId).toBeNull();
  });

  it("a scheduled self-drop is a no-op", () => {
    expect(reorderCommand(initPlanEditor(rowsAB), { activeId: "a", overId: "a", chapterId: null })).toBeNull();
  });

  it("reorders a rough stop within its container; dates never move", () => {
    const s = initPlanEditor(rows(stopsABC));
    const cmd = reorderCommand(s, { activeId: "c", overId: "b", chapterId: null })!;
    expect(cmd.request).toEqual({
      items: [{ id: "a", chapterId: null }, { id: "c", chapterId: null }, { id: "b", chapterId: null }],
      movedStopIds: ["c"],
    });
    expect(ids(cmd.rows.stops)).toEqual(["a", "c", "b"]);
    expect(cmd.rows.stops.map((x) => x.sortOrder)).toEqual([0, 1, 2]);
    expect(ids(cmd.before.placements).sort()).toEqual(["b", "c"]);
  });

  it("moves a rough stop into a rough chapter container", () => {
    const chR = itineraryChapter({ id: "chR", startDate: null, endDate: null });
    const s = initPlanEditor(rows([rough("a", 0, "chR"), rough("b", 1)], [chR]));
    const cmd = reorderCommand(s, { activeId: "b", overId: "chR", chapterId: "chR" })!;
    expect(cmd.request.items).toEqual([{ id: "a", chapterId: "chR" }, { id: "b", chapterId: "chR" }]);
    expect(cmd.rows.stops.find((x) => x.id === "b")!.chapterId).toBe("chR");
  });

  it("blocks a rough stop from entering a dated chapter", () => {
    const chD = itineraryChapter({ id: "chD" });
    const s = initPlanEditor(rows([rough("a", 0), { ...sb, sortOrder: 1, chapterId: "chD" }], [chD]));
    expect(reorderCommand(s, { activeId: "a", overId: "chD", chapterId: "chD" })).toBeNull();
  });
});

describe("reorderChaptersCommand (ported from handleDragEnd's chapter drag)", () => {
  const chD1 = itineraryChapter({ id: "d1", sortOrder: 0, startDate: "2026-11-01", endDate: "2026-11-04" });
  const chD2 = itineraryChapter({ id: "d2", sortOrder: 1, startDate: "2026-11-04", endDate: "2026-11-06" });
  const chR1 = itineraryChapter({ id: "r1", sortOrder: 2, startDate: null, endDate: null });
  const chR2 = itineraryChapter({ id: "r2", sortOrder: 3, startDate: null, endDate: null });

  // r is rough and ungrouped, first in the arrangement; reorderChapters moves it to the end.
  const datedPlan = () => initPlanEditor(rows(
    [rough("r", 0), { ...sa, sortOrder: 1, chapterId: "d1" }, { ...sb, sortOrder: 2, chapterId: "d2" }],
    [chD1, chD2],
  ));

  it("a dated chapter drag predicts the server's stop order and reflow", () => {
    const s = datedPlan();
    const cmd = reorderChaptersCommand(s, { activeId: "d2", overId: "d1" })!;
    expect(ids(cmd.rows.chapters)).toEqual(["d2", "d1"]);
    expect(cmd.rows.chapters.map((c) => c.sortOrder)).toEqual([0, 1]);
    expect(cmd.request).toEqual({ chapterIds: ["d2", "d1"], movedChapterId: "d2", stopItems: null });
    // chapters.ts: each chapter's stops in the new chapter order, then ungrouped; sortOrder = index.
    expect(cmd.rows.stops.map((x) => [x.id, x.sortOrder, x.arriveDate, x.departDate])).toEqual([
      ["b", 0, "2026-11-01", "2026-11-03"],
      ["a", 1, "2026-11-03", "2026-11-06"],
      ["r", 2, null, null],
    ]);
    expect(cmd.before.chapters).toBe(s.rows.chapters);
  });

  it("a dated chapter drag's Undo basis includes a stop whose order changed but dates didn't", () => {
    const s = datedPlan();
    const cmd = reorderChaptersCommand(s, { activeId: "d2", overId: "d1" })!;
    expect(ids(touchedPlacements(cmd.rows.stops, s.rows.stops)).sort()).toEqual(["a", "b", "r"]);
    expect(touchedPlacements(s.rows.stops, cmd.rows.stops).find((p) => p.id === "r")).toEqual({
      id: "r", sortOrder: 2, chapterId: null, arriveDate: null, departDate: null,
    });
  });

  it("a failed dated chapter drag puts chapters and stops back", () => {
    const s0 = datedPlan();
    const cmd = reorderChaptersCommand(s0, { activeId: "d2", overId: "d1" })!;
    let s = planEditorReducer(s0, { type: "begin", rows: cmd.rows });
    s = planEditorReducer(s, { type: "revert", restore: cmd.before });
    s = planEditorReducer(s, { type: "settle" });
    expect(s.rows.chapters).toEqual(s0.rows.chapters);
    expect(s.rows.stops).toEqual(s0.rows.stops);
  });

  it("a rough chapter drag permutes the rough blocks and sends both writes", () => {
    const s = initPlanEditor(rows([rough("x", 0, "r1"), rough("y", 1, "r2"), rough("z", 2)], [chD1, chR1, chR2]));
    const cmd = reorderChaptersCommand(s, { activeId: "r2", overId: "r1" })!;
    expect(ids(cmd.rows.chapters)).toEqual(["d1", "r2", "r1"]);
    expect(ids(cmd.rows.stops)).toEqual(["y", "x", "z"]);
    expect(cmd.request).toEqual({
      chapterIds: ["r2", "r1"],
      movedChapterId: "r2",
      stopItems: [{ id: "y", chapterId: "r2" }, { id: "x", chapterId: "r1" }, { id: "z", chapterId: null }],
    });
    expect(ids(cmd.before.placements).sort()).toEqual(["x", "y"]);
  });

  it("a failed rough chapter drag puts chapters and stops back", () => {
    const s0 = initPlanEditor(rows([rough("x", 0, "r1"), rough("y", 1, "r2"), rough("z", 2)], [chD1, chR1, chR2]));
    const cmd = reorderChaptersCommand(s0, { activeId: "r2", overId: "r1" })!;
    let s = planEditorReducer(s0, { type: "begin", rows: cmd.rows });
    s = planEditorReducer(s, { type: "revert", restore: cmd.before });
    expect(s.rows.chapters).toEqual(s0.rows.chapters);
    expect(s.rows.stops).toEqual(s0.rows.stops);
  });

  it("a self-drop or an unknown chapter is a no-op", () => {
    const s = initPlanEditor(rows([], [chR1, chR2]));
    expect(reorderChaptersCommand(s, { activeId: "r1", overId: "r1" })).toBeNull();
    expect(reorderChaptersCommand(s, { activeId: "nope", overId: "r1" })).toBeNull();
    expect(reorderChaptersCommand(s, { activeId: "r1", overId: "d1" })).toBeNull();
  });
});

describe("assignChapterCommand and setNightsCommand", () => {
  it("assigns a stop's chapter and returns its old placement", () => {
    const s = initPlanEditor(rows(stopsABC));
    const cmd = assignChapterCommand(s, { stopId: "b", chapterId: "chR" });
    expect(cmd.rows.stops.find((x) => x.id === "b")!.chapterId).toBe("chR");
    expect(cmd.before).toEqual({ placements: [{ id: "b", sortOrder: 1, chapterId: null, arriveDate: null, departDate: null }] });
  });

  it("moves a scheduled stop's depart date, in plan order", () => {
    const cmd = setNightsCommand(initPlanEditor(rowsAB), { stopId: "a", nights: 5 });
    expect(cmd.rows.stops.find((x) => x.id === "a")!.departDate).toBe("2026-11-06");
    expect(cmd.before).toEqual({ placements: [{ id: "a", sortOrder: 0, chapterId: null, arriveDate: "2026-11-01", departDate: "2026-11-04" }] });
  });

  it("writes nights on a rough stop", () => {
    const cmd = setNightsCommand(initPlanEditor(rows(stopsABC)), { stopId: "a", nights: 4 });
    expect(cmd.rows.stops.find((x) => x.id === "a")!.nights).toBe(4);
    expect(cmd.before).toEqual({ placements: [], nights: [{ id: "a", nights: 2 }] });
  });

  it("a failed rough setNights puts the nights back", () => {
    const s0 = initPlanEditor(rows(stopsABC));
    const cmd = setNightsCommand(s0, { stopId: "a", nights: 4 });
    let s = planEditorReducer(s0, { type: "begin", rows: cmd.rows });
    s = planEditorReducer(s, { type: "revert", restore: cmd.before });
    expect(s.rows.stops.find((x) => x.id === "a")!.nights).toBe(2);
  });
});
