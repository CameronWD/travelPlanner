import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/server/actions/stops", () => ({
  reorderStops: vi.fn(),
  restoreStops: vi.fn(),
  setStopNights: vi.fn(),
  setStopDates: vi.fn(),
  firmUpSegment: vi.fn(),
  firmUpTrip: vi.fn(),
}));
vi.mock("@/server/actions/chapters", () => ({
  reorderChapters: vi.fn(),
  assignStopToChapter: vi.fn(),
}));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/ui/undo-toast", () => ({ toastWithUndo: vi.fn(() => "t1") }));

import { reorderStops, restoreStops, setStopNights, setStopDates, firmUpSegment, firmUpTrip } from "@/server/actions/stops";
import { reorderChapters, assignStopToChapter } from "@/server/actions/chapters";
import { toast } from "@/components/ui/use-toast";
import { toastWithUndo } from "@/components/ui/undo-toast";
import { UNDO_FAILED } from "@/components/ui/use-undoable-action";
import { stop, chapter, type StopRow, type ChapterRow } from "@/test/builders";
import type { ItineraryChapter, ItineraryStop } from "@/components/trip/itinerary-manager";
import type { PlanRows } from "./plan-editor-state";
import { usePlanEditor } from "./use-plan-editor";

const reorderStopsMock = vi.mocked(reorderStops);
const restoreStopsMock = vi.mocked(restoreStops);
const reorderChaptersMock = vi.mocked(reorderChapters);
const toastMock = vi.mocked(toast);
const undoToastMock = vi.mocked(toastWithUndo);

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
const rows = (stops: ItineraryStop[], chapters: ItineraryChapter[] = []): PlanRows => ({ stops, chapters, transports: [] });
const ids = (s: { id: string }[]) => s.map((x) => x.id);

// Scheduled a (1–4 Nov), b (4–6 Nov), c (6–9 Nov).
const sa = itineraryStop({ id: "a", name: "Lisbon", sortOrder: 0, arriveDate: "2026-11-01", departDate: "2026-11-04" });
const sb = itineraryStop({ id: "b", name: "Porto", sortOrder: 1, arriveDate: "2026-11-04", departDate: "2026-11-06" });
const sc = itineraryStop({ id: "c", name: "Faro", sortOrder: 2, arriveDate: "2026-11-06", departDate: "2026-11-09" });
const rowsAB = rows([sa, sb]);
const rowsABC = rows([sa, sb, sc]);

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Clicks the Undo the last success toast offered. */
async function clickUndo() {
  const { onUndo } = undoToastMock.mock.calls.at(-1)![0];
  await act(async () => { onUndo(); });
}

function mount(initial: PlanRows, forkId: string | null = null) {
  return renderHook(({ rows: r }) => usePlanEditor({ tripId: "t1", forkId, rows: r }), { initialProps: { rows: initial } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usePlanEditor — TB-07: rejected drags are caught", () => {
  it("a reorder that rejects toasts and restores plan order (TB-07, Review Focus 3)", async () => {
    reorderStopsMock.mockRejectedValue(new Error("offline"));
    const { result } = mount(rowsAB);
    await act(() => result.current.reorder({ activeId: "b", overId: "a", chapterId: null, movedName: "Porto" }));
    expect(ids(result.current.state.rows.stops)).toEqual(["a", "b"]);
    expect(result.current.state.rows.stops.map((s) => s.arriveDate)).toEqual(["2026-11-01", "2026-11-04"]);
    expect(result.current.state.pending).toBe(0);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("reorderChapters that rejects is caught too, and chapters go back (TB-07)", async () => {
    reorderChaptersMock.mockRejectedValue(new Error("offline"));
    const d1 = itineraryChapter({ id: "d1", name: "North", sortOrder: 0, startDate: "2026-11-01", endDate: "2026-11-04" });
    const d2 = itineraryChapter({ id: "d2", name: "South", sortOrder: 1, startDate: "2026-11-04", endDate: "2026-11-06" });
    const initial = rows([{ ...sa, chapterId: "d1" }, { ...sb, chapterId: "d2" }], [d1, d2]);
    const { result } = mount(initial);
    await act(() => result.current.reorderChapters({ activeId: "d2", overId: "d1", movedName: "South" }));
    expect(ids(result.current.state.rows.chapters)).toEqual(["d1", "d2"]);
    expect(ids(result.current.state.rows.stops)).toEqual(["a", "b"]);
    expect(reorderChaptersMock).toHaveBeenCalledWith("t1", ["d2", "d1"], null, "d2");
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("a rough chapter drag that rejects on its second write puts both back", async () => {
    const r1 = itineraryChapter({ id: "r1", sortOrder: 0, startDate: null, endDate: null });
    const r2 = itineraryChapter({ id: "r2", sortOrder: 1, startDate: null, endDate: null });
    reorderChaptersMock.mockResolvedValue({ success: true, changed: [], conflicts: [] });
    reorderStopsMock.mockRejectedValue(new Error("offline"));
    const initial = rows([rough("x", 0, "r1"), rough("y", 1, "r2")], [r1, r2]);
    const { result } = mount(initial);
    await act(() => result.current.reorderChapters({ activeId: "r2", overId: "r1", movedName: "r2" }));
    // The rough call keeps its old shape: no moved chapter, then the stop order with no moved stops.
    expect(reorderChaptersMock).toHaveBeenCalledWith("t1", ["r2", "r1"], null);
    expect(reorderStopsMock).toHaveBeenCalledWith("t1", [{ id: "y", chapterId: "r2" }, { id: "x", chapterId: "r1" }], null, []);
    expect(ids(result.current.state.rows.chapters)).toEqual(["r1", "r2"]);
    expect(ids(result.current.state.rows.stops)).toEqual(["x", "y"]);
    expect(undoToastMock).not.toHaveBeenCalled();
  });
});

describe("usePlanEditor — the drop guards", () => {
  it("a pinned scheduled stop's drop toasts and writes nothing (was a handler-capture test)", async () => {
    const { result } = mount(rows([{ ...sa, pinned: true }, sb]));
    await act(() => result.current.reorder({ activeId: "a", overId: "b", chapterId: null, movedName: "Lisbon" }));
    expect(toastMock).toHaveBeenCalledWith({ title: "This stop is pinned. Unpin it to move it." });
    expect(reorderStopsMock).not.toHaveBeenCalled();
    expect(result.current.state.pending).toBe(0);
  });

  it("an unpinned scheduled stop's drop is written (was a handler-capture test)", async () => {
    reorderStopsMock.mockResolvedValue({ success: true, changed: [], conflicts: [] });
    const { result } = mount(rowsAB);
    await act(() => result.current.reorder({ activeId: "b", overId: "a", chapterId: null, movedName: "Porto" }));
    expect(reorderStopsMock).toHaveBeenCalledWith("t1", [{ id: "b", chapterId: null }, { id: "a", chapterId: null }], null, ["b"]);
  });

  it("a rough stop's drop shows no toast at all, and offers no Undo", async () => {
    reorderStopsMock.mockResolvedValue({ success: true, changed: [], conflicts: [] });
    const { result } = mount(rows([rough("a", 0), rough("b", 1)]));
    await act(() => result.current.reorder({ activeId: "b", overId: "a", chapterId: null, movedName: "b" }));
    expect(ids(result.current.state.rows.stops)).toEqual(["b", "a"]);
    expect(toastMock).not.toHaveBeenCalled();
    expect(undoToastMock).not.toHaveBeenCalled();
  });
});

describe("usePlanEditor — ARCH-CMP-1/2: props and Undo", () => {
  it("applies the server's reflowed dates and offers Undo with the move's copy", async () => {
    reorderStopsMock.mockResolvedValue({ success: true, changed: [{ id: "a", arriveDate: "2026-11-03", departDate: "2026-11-07" }], conflicts: [] });
    const { result } = mount(rowsAB);
    await act(() => result.current.reorder({ activeId: "b", overId: "a", chapterId: null, movedName: "Porto" }));
    expect(result.current.state.rows.stops.find((s) => s.id === "a")!.departDate).toBe("2026-11-07");
    expect(undoToastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Moved Porto; 1 stop had dates shifted" }));
  });

  it("Undo restores only the touched rows (ARCH-CMP-2)", async () => {
    reorderStopsMock.mockResolvedValue({ success: true, changed: [{ id: "a", arriveDate: "2026-11-03", departDate: "2026-11-06" }], conflicts: [] });
    restoreStopsMock.mockResolvedValue({ success: true });
    const { result } = mount(rowsABC);
    await act(() => result.current.reorder({ activeId: "b", overId: "a", chapterId: null, movedName: "Porto" }));
    await clickUndo();
    expect(restoreStopsMock).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "a" }), expect.objectContaining({ id: "b" })],
      null,
      undefined,
    );
    const entries = restoreStopsMock.mock.calls[0][0];
    expect(entries).toHaveLength(2); // c never moved: not the whole plan
    // Each entry carries its pre-move placement.
    expect(entries.find((e) => e.id === "a")).toEqual({ id: "a", sortOrder: 0, chapterId: null, arriveDate: "2026-11-01", departDate: "2026-11-04" });
    expect(entries.find((e) => e.id === "b")).toEqual({ id: "b", sortOrder: 1, chapterId: null, arriveDate: "2026-11-04", departDate: "2026-11-06" });
    // Locally the plan is back as it was.
    expect(ids(result.current.state.rows.stops)).toEqual(["a", "b", "c"]);
    expect(result.current.state.pending).toBe(0);
  });

  it("Undo carries the inverted payload and the Fork", async () => {
    reorderStopsMock.mockResolvedValue({
      success: true, changed: [], conflicts: [],
      payload: { items: [{ id: "i1", date: "2026-11-02", prevDate: "2026-11-05", prevStopId: "b" }], accommodations: [] },
    });
    restoreStopsMock.mockResolvedValue({ success: true });
    const { result } = mount(rowsAB, "fork-1");
    await act(() => result.current.reorder({ activeId: "b", overId: "a", chapterId: null, movedName: "Porto" }));
    await clickUndo();
    expect(restoreStopsMock.mock.calls[0][1]).toBe("fork-1");
    expect(restoreStopsMock.mock.calls[0][2]).toEqual({ items: [{ id: "i1", date: "2026-11-05", stopId: "b" }], accommodations: [] });
  });

  it("an Undo whose restore fails toasts and re-shows the server's rows", async () => {
    reorderStopsMock.mockResolvedValue({ success: true, changed: [{ id: "a", arriveDate: "2026-11-03", departDate: "2026-11-06" }], conflicts: [] });
    restoreStopsMock.mockRejectedValue(new Error("offline"));
    const { result } = mount(rowsAB);
    await act(() => result.current.reorder({ activeId: "b", overId: "a", chapterId: null, movedName: "Porto" }));
    const settled = result.current.state.rows.stops;
    await clickUndo();
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: UNDO_FAILED })));
    expect(ids(result.current.state.rows.stops)).toEqual(["b", "a"]);
    expect(result.current.state.rows.stops).toEqual(settled);
    expect(result.current.state.pending).toBe(0);
  });

  it("a failed Undo settles after reverting, so props held during it win", async () => {
    reorderStopsMock.mockResolvedValue({ success: true, changed: [], conflicts: [] });
    const restore = deferred<Awaited<ReturnType<typeof restoreStops>>>();
    restoreStopsMock.mockReturnValue(restore.promise);
    const { result, rerender } = mount(rowsAB);
    await act(() => result.current.reorder({ activeId: "b", overId: "a", chapterId: null, movedName: "Porto" }));
    await clickUndo();
    expect(result.current.state.pending).toBe(1);
    // A newer server snapshot lands while the Undo is in flight: held.
    const newer = rows([
      { ...sb, sortOrder: 0, arriveDate: "2026-11-01", departDate: "2026-11-03", name: "Oporto" },
      // Someone else stretched Lisbon meanwhile: a placement the revert must not paper over.
      { ...sa, sortOrder: 1, arriveDate: "2026-11-03", departDate: "2026-11-08" },
    ]);
    rerender({ rows: newer });
    expect(result.current.state.held).not.toBeNull();
    await act(async () => { restore.reject(new Error("offline")); });
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: UNDO_FAILED })));
    expect(result.current.state.pending).toBe(0);
    expect(result.current.state.held).toBeNull();
    expect(result.current.state.rows.stops).toEqual(newer.stops);
  });

  it("an Undo the server refuses also re-shows the server's rows", async () => {
    reorderStopsMock.mockResolvedValue({ success: true, changed: [], conflicts: [] });
    restoreStopsMock.mockResolvedValue({ success: false, errors: { _: ["Nope."] } });
    const { result } = mount(rowsAB);
    await act(() => result.current.reorder({ activeId: "b", overId: "a", chapterId: null, movedName: "Porto" }));
    await clickUndo();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "Nope." }));
    expect(ids(result.current.state.rows.stops)).toEqual(["b", "a"]);
  });

  it("props arriving mid-reorder are held until it settles (ARCH-CMP-1)", async () => {
    const write = deferred<Awaited<ReturnType<typeof reorderStops>>>();
    reorderStopsMock.mockReturnValue(write.promise);
    const { result, rerender } = mount(rowsAB);
    let done!: Promise<void>;
    act(() => { done = result.current.reorder({ activeId: "b", overId: "a", chapterId: null, movedName: "Porto" }); });
    expect(ids(result.current.state.rows.stops)).toEqual(["b", "a"]);
    expect(result.current.state.pending).toBe(1);

    // A refresh lands mid-write carrying the pre-move order and a rename.
    rerender({ rows: rows([{ ...sa, name: "Lisboa" }, sb]) });
    expect(ids(result.current.state.rows.stops)).toEqual(["b", "a"]);
    expect(result.current.state.rows.stops.find((s) => s.id === "a")!.name).toBe("Lisbon");

    await act(async () => { write.resolve({ success: true, changed: [], conflicts: [] }); await done; });
    expect(result.current.state.pending).toBe(0);
    expect(result.current.state.rows.stops.find((s) => s.id === "a")!.name).toBe("Lisboa");
  });

  it("a fresh props object with the same content changes nothing (ARCH-CMP-1)", () => {
    const { result, rerender } = mount(rowsAB);
    const before = result.current.state;
    rerender({ rows: structuredClone(rowsAB) });
    expect(result.current.state).toBe(before);
  });

  it("pending comes back down after a refusal, adopting held props", async () => {
    const write = deferred<Awaited<ReturnType<typeof reorderStops>>>();
    reorderStopsMock.mockReturnValue(write.promise);
    const { result, rerender } = mount(rowsAB);
    let done!: Promise<void>;
    act(() => { done = result.current.reorder({ activeId: "b", overId: "a", chapterId: null, movedName: "Porto" }); });
    rerender({ rows: rows([{ ...sa, name: "Lisboa" }, sb]) });
    await act(async () => { write.resolve({ success: false, errors: { _: ["Not allowed."] } }); await done; });
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "Not allowed." }));
    expect(result.current.state.pending).toBe(0);
    expect(ids(result.current.state.rows.stops)).toEqual(["a", "b"]);
    expect(result.current.state.rows.stops[0].name).toBe("Lisboa");
  });
});

describe("usePlanEditor — assign, nights, dates, firm-up", () => {
  it("assign is optimistic, reverts on a rejection and toasts", async () => {
    const write = deferred<Awaited<ReturnType<typeof assignStopToChapter>>>();
    vi.mocked(assignStopToChapter).mockReturnValue(write.promise);
    const r1 = itineraryChapter({ id: "r1", startDate: null, endDate: null });
    const { result } = mount(rows([rough("a", 0)], [r1]));
    let done!: Promise<void>;
    act(() => { done = result.current.assign({ stopId: "a", chapterId: "r1" }); });
    expect(result.current.state.rows.stops[0].chapterId).toBe("r1");
    await act(async () => { write.reject(new Error("offline")); await done; });
    expect(result.current.state.rows.stops[0].chapterId).toBeNull();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    expect(undoToastMock).not.toHaveBeenCalled();
  });

  it("a scheduled setNights offers the ripple Undo; a rough one does not", async () => {
    vi.mocked(setStopNights).mockResolvedValue({ success: true, changed: [{ id: "b", arriveDate: "2026-11-05", departDate: "2026-11-07" }], conflicts: [] });
    const { result } = mount(rows([sa, sb, rough("r", 2)]));
    await act(() => result.current.setNights({ stopId: "a", nights: 4, name: "Lisbon" }));
    expect(result.current.state.rows.stops.find((s) => s.id === "a")!.departDate).toBe("2026-11-05");
    expect(result.current.state.rows.stops.find((s) => s.id === "b")!.arriveDate).toBe("2026-11-05");
    expect(undoToastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Moved Lisbon; 1 stop had dates shifted" }));
    undoToastMock.mockClear();
    vi.mocked(setStopNights).mockResolvedValue({ success: true });
    await act(() => result.current.setNights({ stopId: "r", nights: 5, name: "r" }));
    expect(result.current.state.rows.stops.find((s) => s.id === "r")!.nights).toBe(5);
    expect(undoToastMock).not.toHaveBeenCalled();
  });

  it("a refused rough setNights puts the nights back", async () => {
    vi.mocked(setStopNights).mockResolvedValue({ success: false, errors: { nights: ["Nights must be between 0 and 366"] } });
    const { result } = mount(rows([rough("r", 0)]));
    await act(() => result.current.setNights({ stopId: "r", nights: 400, name: "r" }));
    expect(result.current.state.rows.stops[0].nights).toBe(2);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Nights must be between 0 and 366" }));
  });

  it("setDates applies the dates only on success, then offers Undo of just the touched rows", async () => {
    const write = deferred<Awaited<ReturnType<typeof setStopDates>>>();
    vi.mocked(setStopDates).mockReturnValue(write.promise);
    restoreStopsMock.mockResolvedValue({ success: true });
    const { result } = mount(rowsABC);
    let ok: Promise<boolean>;
    act(() => { ok = result.current.setDates({ stopId: "a", dates: { arriveDate: "2026-11-01", departDate: "2026-11-05" }, name: "Lisbon" }); });
    expect(result.current.state.rows.stops[0].departDate).toBe("2026-11-04"); // not optimistic
    expect(result.current.state.pending).toBe(1);
    await act(async () => {
      write.resolve({ success: true, changed: [{ id: "b", arriveDate: "2026-11-05", departDate: "2026-11-07" }], conflicts: [] });
      expect(await ok).toBe(true);
    });
    expect(result.current.state.rows.stops[0].departDate).toBe("2026-11-05");
    expect(result.current.state.rows.stops[1].arriveDate).toBe("2026-11-05");
    await clickUndo();
    expect(restoreStopsMock.mock.calls[0][0].map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect(result.current.state.rows.stops[0].departDate).toBe("2026-11-04");
  });

  it("setDates returns false and changes nothing when refused", async () => {
    vi.mocked(setStopDates).mockResolvedValue({ success: false, errors: { departDate: ["Depart date must be on or after arrive date"] } });
    const { result } = mount(rowsAB);
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.setDates({ stopId: "a", dates: { arriveDate: "2026-11-05", departDate: "2026-11-01" }, name: "Lisbon" }); });
    expect(ok).toBe(false);
    expect(result.current.state.rows).toEqual(rowsAB);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "Depart date must be on or after arrive date" }));
  });

  it("firmUp holds props while pending, keeps its anchor and conflict toasts, and threads the Fork", async () => {
    vi.mocked(firmUpSegment).mockResolvedValue({ success: true, conflicts: [{ stopId: "a", message: "x" }] });
    const { result } = mount(rows([rough("a", 0, "r1")]), "fork-1");
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.firmUp({ chapterId: "r1" }); });
    expect(ok).toBe(true);
    expect(firmUpSegment).toHaveBeenCalledWith({ tripId: "t1", chapterId: "r1", forkId: "fork-1" });
    expect(toastMock).toHaveBeenCalledWith({ title: "Heads up: earlier stops run past a pinned date; the pin was kept." });
    expect(result.current.state.pending).toBe(0);

    vi.mocked(firmUpTrip).mockResolvedValue({ success: false, errors: { anchorDate: ["Set a start date for the trip first."] } });
    await act(async () => { ok = await result.current.firmUp({}); });
    expect(ok).toBe(false);
    expect(firmUpTrip).toHaveBeenCalledWith("t1", undefined, "fork-1");
    expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", title: "Set a start date for the trip first." });

    vi.mocked(firmUpSegment).mockRejectedValue(new Error("offline"));
    await act(async () => { ok = await result.current.firmUp({ chapterId: null }); });
    expect(ok).toBe(false);
    expect(firmUpSegment).toHaveBeenLastCalledWith({ tripId: "t1", chapterId: null, forkId: "fork-1" });
    expect(toastMock).toHaveBeenLastCalledWith(expect.objectContaining({ variant: "destructive", title: expect.stringMatching(/nothing changed/i) }));
    expect(result.current.state.pending).toBe(0);
  });
});
