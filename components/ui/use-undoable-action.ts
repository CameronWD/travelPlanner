"use client";

import * as React from "react";
import type { ActionResult } from "@/lib/action-result";
import { toast } from "@/components/ui/use-toast";
import { toastWithUndo } from "@/components/ui/undo-toast";
import { SOMETHING_WENT_WRONG, toastRefused, toastRejected } from "@/components/ui/action-failure";

/** The success branch of `persist`'s result, as `done`/`undo`/`applyUndo`/`revertUndo` receive it. */
export type UndoableSuccess<R extends object> = { success: true } & R;

export interface UndoableSpec<I, R extends object = Record<never, never>> {
  /** Optimistic local change; runs before persist. */
  apply?(intent: I): void;
  /** The server call. A rejection or `success: false` is a failure. */
  persist(intent: I): Promise<ActionResult<R>>;
  /** Put local state back after a failed persist. */
  revert?(intent: I): void;
  /** The inverse server call, offered as the toast's Undo. Omit for no Undo. */
  undo?(intent: I, result: UndoableSuccess<R>): Promise<ActionResult<object>>;
  /** Re-apply local state for an Undo (before its server call). */
  applyUndo?(intent: I, result: UndoableSuccess<R>): void;
  /** Put local state back to what the server still holds after a failed Undo. */
  revertUndo?(intent: I, result: UndoableSuccess<R>): void;
  /** Success toast; with `undo` it carries the Undo button. `null` for no toast. */
  done?(
    intent: I,
    result: UndoableSuccess<R>,
  ): { title: React.ReactNode; description?: React.ReactNode } | null;
  /** Fallback failure copy (refusals use their own `_` message via toastRefused). */
  failure?: string;
}

/** The one wording for an Undo that didn't go through. */
export const UNDO_FAILED = "Couldn't undo. Nothing changed. Try again.";

/**
 * One optimistic, undoable write: `apply` locally, `persist` on the server,
 * `revert` and toast on failure, else the `done` toast — with an Undo button
 * (via `toastWithUndo`) when the spec has `undo`. The Undo runs `applyUndo`
 * then `undo`; if that fails it toasts `UNDO_FAILED` (offline-aware) and calls
 * `revertUndo`. The Undo path never rejects.
 *
 * `spec` is read through a ref captured at `run` time, so a re-render mid-run
 * never swaps an in-flight run's callbacks. `run` is stable across renders.
 */
export function useUndoableAction<I, R extends object = Record<never, never>>(
  spec: UndoableSpec<I, R>,
): { run(intent: I): Promise<boolean>; pending: boolean } {
  const specRef = React.useRef(spec);
  React.useLayoutEffect(() => {
    specRef.current = spec;
  }, [spec]);

  const inFlight = React.useRef(0);
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(async (intent: I): Promise<boolean> => {
    const s = specRef.current;
    inFlight.current += 1;
    setPending(true);
    try {
      let result: ActionResult<R>;
      try {
        s.apply?.(intent);
        result = await s.persist(intent);
      } catch {
        s.revert?.(intent);
        toastRejected(s.failure ?? SOMETHING_WENT_WRONG);
        return false;
      }
      if (!result.success) {
        s.revert?.(intent);
        toastRefused(result, s.failure ?? SOMETHING_WENT_WRONG);
        return false;
      }
      const success = result as UndoableSuccess<R>;
      const copy = s.done?.(intent, success) ?? null;
      const undo = s.undo;
      if (copy && undo) {
        toastWithUndo({
          ...copy,
          onUndo: () => {
            void runUndo(s, undo, intent, success);
          },
        });
      } else if (copy) {
        toast(copy);
      }
      return true;
    } finally {
      inFlight.current -= 1;
      if (inFlight.current === 0) setPending(false);
    }
  }, []);

  return { run, pending };
}

/** The Undo click: resolves always — every failure becomes a toast plus `revertUndo`. */
async function runUndo<I, R extends object>(
  s: UndoableSpec<I, R>,
  undo: NonNullable<UndoableSpec<I, R>["undo"]>,
  intent: I,
  result: UndoableSuccess<R>,
): Promise<void> {
  try {
    s.applyUndo?.(intent, result);
    const r = await undo(intent, result);
    if (r.success) return;
    toastRefused(r, UNDO_FAILED);
  } catch {
    toastRejected(UNDO_FAILED);
  }
  try {
    s.revertUndo?.(intent, result);
  } catch {
    // Local state is the caller's; a throwing revertUndo must not reject the click.
  }
}
