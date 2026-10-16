"use client";

/**
 * The Plan editor's rows and every write that moves them (card 2.G, spec Q7).
 *
 * The rows live in `planEditorReducer`: server props are adopted when idle,
 * held while a write is pending, and compared by content (ARCH-CMP-1). Each
 * method below runs one write the same way — command → `begin` (optimistic
 * rows, pending + 1) → `useUndoableAction` → `settle` in a `finally`, so
 * pending always comes back down and held props get adopted, whatever the
 * write did. A failed write `revert`s to the command's pre-image (the one
 * revert path, ARCH-CMP-3); a scheduled move's Undo writes back only the
 * Stops it touched (ARCH-CMP-2); a rejected write is caught and toasted
 * like a refused one (TB-07).
 */
import * as React from "react";
import type { ActionResult } from "@/lib/action-result";
import { toast } from "@/components/ui/use-toast";
import { toastRejected } from "@/components/ui/action-failure";
import { useUndoableAction, type UndoableSuccess } from "@/components/ui/use-undoable-action";
import { reorderStops, restoreStops, setStopNights, setStopDates, firmUpSegment, firmUpTrip } from "@/server/actions/stops";
import { reorderChapters, assignStopToChapter } from "@/server/actions/chapters";
import { summariseReorder, undoPayloadFor, type ReorderPayload } from "./plan-editor-copy";
import {
  applyChanged,
  assignChapterCommand,
  initPlanEditor,
  planEditorReducer,
  reorderChaptersCommand,
  reorderCommand,
  setNightsCommand,
  touchedPlacements,
  type ChangedDates,
  type PlanEditorEvent,
  type PlanEditorState,
  type PlanRestore,
  type PlanRows,
} from "./plan-editor-state";

/** What a placement write answers on success (reorderStops, reorderChapters, setStopNights, setStopDates, assignStopToChapter). */
type Placed = { changed?: ChangedDates; conflicts?: { stopId: string; message: string }[]; payload?: ReorderPayload };

/** One placement write, as the methods hand it to `useUndoableAction`. */
interface Write {
  /** The rows before the command (the Undo's baseline). */
  pre: PlanRows;
  /** What renders while the write is in flight. */
  optimistic: PlanRows;
  /** Dates the write itself sets, applied on success before the server's `changed` (only a write that isn't optimistic). */
  confirmed?: ChangedDates;
  /** The command's pre-image: what a failed write reverts to. */
  before: PlanRestore;
  /** The server call. */
  call: () => Promise<ActionResult<Placed>>;
  /** A scheduled move's name for its toast; null for a write with no toast and no Undo. */
  movedName: string | null;
}

/** Every date a successful write confirmed: its own, then the server's reflow. */
function confirmedDates(w: Write, r: { changed?: ChangedDates }): ChangedDates {
  return [...(w.confirmed ?? []), ...(r.changed ?? [])];
}

/** The rows the server now holds after a successful write. */
function settledRows(w: Write, r: UndoableSuccess<Placed>): PlanRows {
  return applyChanged(w.optimistic, confirmedDates(w, r));
}

export function usePlanEditor({ tripId, forkId, rows }: { tripId: string; forkId: string | null; rows: PlanRows }): {
  state: PlanEditorState;
  reorder(a: { activeId: string; overId: string; chapterId: string | null; movedName: string }): Promise<void>;
  reorderChapters(a: { activeId: string; overId: string; movedName: string }): Promise<void>;
  assign(a: { stopId: string; chapterId: string | null }): Promise<void>;
  setNights(a: { stopId: string; nights: number; name: string }): Promise<void>;
  setDates(a: { stopId: string; dates: { arriveDate: string; departDate: string }; name: string }): Promise<boolean>;
  /** Whole trip when `chapterId` is omitted; null is the ungrouped run. */
  firmUp(a: { chapterId?: string | null }): Promise<boolean>;
  /** For the flash (`flashed`). */
  dispatch: React.Dispatch<PlanEditorEvent>;
} {
  // Callbacks that run after an await (settle, Undo) only ever dispatch
  // events the reducer applies to its current rows — never a render-time snapshot.
  const [state, dispatch] = React.useReducer(planEditorReducer, rows, initPlanEditor);

  React.useEffect(() => {
    dispatch({ type: "props", rows });
  }, [rows, dispatch]);

  function spec(failure: string | undefined) {
    return {
      persist: (w: Write) => w.call(),
      revert: (w: Write) => dispatch({ type: "revert", restore: w.before }),
      done: (w: Write, r: UndoableSuccess<Placed>) =>
        w.movedName === null ? null : summariseReorder(w.movedName, r.changed ?? [], r.conflicts),
      // Undo writes back only what the write touched, with the pre-move values (ARCH-CMP-2).
      // A successful Undo settles here; a failed one settles in revertUndo,
      // after the revert, so props held meanwhile are adopted last and win.
      undo: async (w: Write, r: UndoableSuccess<Placed>) => {
        const res = await restoreStops(
          touchedPlacements(settledRows(w, r).stops, w.pre.stops),
          forkId ?? null,
          r.payload ? undoPayloadFor(r.payload) : undefined,
        );
        if (res.success) dispatch({ type: "settle" });
        return res;
      },
      applyUndo: (w: Write, r: UndoableSuccess<Placed>) => {
        dispatch({ type: "begin" }); // the Undo is a write too: props hold until it answers
        dispatch({ type: "revert", restore: { placements: touchedPlacements(settledRows(w, r).stops, w.pre.stops) } });
      },
      // Back to what the server still holds, then settle the Undo (runUndo
      // calls this once per failed Undo; the revert itself is idempotent).
      revertUndo: (w: Write, r: UndoableSuccess<Placed>) => {
        dispatch({ type: "revert", restore: { placements: touchedPlacements(w.pre.stops, settledRows(w, r).stops) } });
        dispatch({ type: "settle" });
      },
      failure,
    };
  }

  const reorderAction = useUndoableAction<Write, Placed>(spec("Couldn't reorder stops. Try again."));
  const chaptersAction = useUndoableAction<Write, Placed>(spec("Couldn't reorder chapters. Try again."));
  // No own copy: a rejection reads "…Nothing changed. Try again." as it always did.
  const assignAction = useUndoableAction<Write, Placed>(spec(undefined));
  const nightsAction = useUndoableAction<Write, Placed>(spec(undefined));
  const datesAction = useUndoableAction<Write, Placed>(spec(undefined));

  async function write(
    action: { run(w: Write): Promise<boolean> },
    w: Write,
  ): Promise<boolean> {
    // The dates a success confirmed, recorded by `call` for the settle.
    const outcome: { changed?: ChangedDates } = {};
    const full: Write = {
      ...w,
      call: async () => {
        const r = await w.call();
        if (r.success) outcome.changed = confirmedDates(w, r);
        return r;
      },
    };
    dispatch({ type: "begin", rows: w.optimistic });
    try {
      return await action.run(full);
    } finally {
      // Every exit — success, refusal, rejection — brings pending back down.
      dispatch({ type: "settle", changed: outcome.changed });
    }
  }

  async function reorder(a: { activeId: string; overId: string; chapterId: string | null; movedName: string }): Promise<void> {
    const s = state;
    const active = s.rows.stops.find((x) => x.id === a.activeId);
    if (active && active.arriveDate !== null && active.pinned) {
      toast({ title: "This stop is pinned. Unpin it to move it." });
      return;
    }
    const cmd = reorderCommand(s, a);
    if (!cmd || !active) return;
    await write(reorderAction, {
      pre: s.rows,
      optimistic: cmd.rows,
      before: cmd.before,
      call: () => reorderStops(tripId, cmd.request.items, forkId ?? null, cmd.request.movedStopIds),
      movedName: active.arriveDate !== null ? a.movedName : null,
    });
  }

  async function reorderChaptersFn(a: { activeId: string; overId: string; movedName: string }): Promise<void> {
    const s = state;
    const cmd = reorderChaptersCommand(s, a);
    if (!cmd) return;
    const { chapterIds, movedChapterId, stopItems } = cmd.request;
    await write(chaptersAction, {
      pre: s.rows,
      optimistic: cmd.rows,
      before: cmd.before,
      call:
        stopItems === null
          // Dated: one call rebuilds the stop order and reflows (ADR 0021).
          ? () => reorderChapters(tripId, chapterIds, forkId ?? null, movedChapterId)
          // Rough: the chapter order, then the stop order; no dates move.
          : async () => {
            const c = await reorderChapters(tripId, chapterIds, forkId ?? null);
            if (!c.success) return c;
            return reorderStops(tripId, stopItems, forkId ?? null, []);
          },
      movedName: stopItems === null ? a.movedName : null,
    });
  }

  async function assign(a: { stopId: string; chapterId: string | null }): Promise<void> {
    const s = state;
    const cmd = assignChapterCommand(s, a);
    await write(assignAction, {
      pre: s.rows,
      optimistic: cmd.rows,
      before: cmd.before,
      call: () => assignStopToChapter(a.stopId, a.chapterId),
      movedName: null,
    });
  }

  async function setNights(a: { stopId: string; nights: number; name: string }): Promise<void> {
    const s = state;
    const target = s.rows.stops.find((x) => x.id === a.stopId);
    if (!target) return;
    const cmd = setNightsCommand(s, a);
    await write(nightsAction, {
      pre: s.rows,
      optimistic: cmd.rows,
      before: cmd.before,
      call: () => setStopNights(a.stopId, a.nights),
      // Scheduled: a ripple, with the same Undo toast as a drag. Rough: silent.
      movedName: target.arriveDate ? a.name : null,
    });
  }

  /** Not optimistic: the dates land with the server's answer (the dialog stays open on a refusal). */
  async function setDates(a: { stopId: string; dates: { arriveDate: string; departDate: string }; name: string }): Promise<boolean> {
    const s = state;
    return write(datesAction, {
      pre: s.rows,
      optimistic: s.rows,
      confirmed: [{ id: a.stopId, ...a.dates }],
      before: { placements: [] },
      call: () => setStopDates(a.stopId, a.dates),
      movedName: a.name,
    });
  }

  /**
   * Firm up one leg (`chapterId`, null = the ungrouped run) or, with
   * `chapterId` omitted, the whole trip. No optimistic change: the write is
   * pending (props held) until it answers. Returns whether it dated anything.
   */
  async function firmUp(a: { chapterId?: string | null }): Promise<boolean> {
    const wholeTrip = a.chapterId === undefined;
    dispatch({ type: "begin" });
    try {
      const r = wholeTrip
        ? await firmUpTrip(tripId, undefined, forkId ?? undefined)
        : await firmUpSegment({ tripId, chapterId: a.chapterId ?? null, forkId: forkId ?? undefined });
      if (!r.success) {
        toast({
          variant: "destructive",
          title: r.errors.anchorDate?.[0] ?? (wholeTrip ? "Set a start date for the trip first." : "Pick a start date for this leg first."),
        });
        return false;
      }
      if (r.conflicts?.length) {
        toast({
          title: wholeTrip
            ? "Heads up: some stops run past a pinned date; the pins were kept."
            : "Heads up: earlier stops run past a pinned date; the pin was kept.",
        });
      }
      return true;
    } catch {
      // A rejected action behaves like a failed one: report, and tell callers
      // nothing was dated (things-to-fix P2-1).
      toastRejected();
      return false;
    } finally {
      dispatch({ type: "settle" });
    }
  }

  return { state, reorder, reorderChapters: reorderChaptersFn, assign, setNights, setDates, firmUp, dispatch };
}
