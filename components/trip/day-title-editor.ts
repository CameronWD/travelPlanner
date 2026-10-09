"use client";

import * as React from "react";
import { toast } from "@/components/ui/use-toast";
import { setDayTitle } from "@/server/actions/day-titles";

/** CONTEXT.md "Day title" — kept short so it reads as a label, not a caption. Mirrors server/actions/day-titles.ts. */
export const DAY_TITLE_MAX_LENGTH = 80;

/**
 * The one edit flow for a Day title (CONTEXT.md "Day title"), shared by the
 * Day view's header line (the primary entry point, spec 2026-09-28 D4) and
 * the plan editor's day row. Enter or blur saves via `setDayTitle` (an empty
 * save clears the title); Escape reverts and cancels without saving.
 *
 * Enter/Escape both unmount the still-focused input, which fires a native
 * blur → `save` runs again with a stale closure. Whichever of {Enter's save,
 * Escape's cancel, a genuine blur-triggered save} runs FIRST flips
 * `committingRef` so a trailing blur from the same edit session is a no-op —
 * otherwise Enter double-submitted (two setDayTitle calls, two Activity
 * rows). Reset only when a fresh session starts or a failed save reopens.
 */
export function useDayTitleEditor({ stopId, date, title }: { stopId: string | null; date: string; title: string | null | undefined }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState("");
  const committingRef = React.useRef(false);
  const current = title ?? "";

  // Seeded here rather than synced via an effect, so a `title` that changed
  // while idle (a save elsewhere revalidated the page) is never stale the
  // next time editing starts.
  const startEditing = React.useCallback(() => {
    committingRef.current = false;
    setValue(current);
    setEditing(true);
  }, [current]);

  const save = React.useCallback(async () => {
    if (committingRef.current) return;
    committingRef.current = true;
    const trimmed = value.trim();
    setEditing(false);
    if (trimmed === current) return;
    if (!stopId) return; // a gap day has no Stop to own a title (Review Focus 2)
    // A thrown save (e.g. offline) is a failed save — same branch as `!res.success`.
    let res: Awaited<ReturnType<typeof setDayTitle>>;
    try {
      res = await setDayTitle({ stopId, date, title: trimmed });
    } catch {
      res = { success: false, errors: {} };
    }
    if (!res.success) {
      toast({ title: "Couldn't save the day title.", variant: "destructive" });
      // Reopen with what was typed rather than discarding it.
      committingRef.current = false;
      setEditing(true);
      return;
    }
  }, [value, current, stopId, date]);

  const cancel = React.useCallback(() => {
    committingRef.current = true;
    setValue(current);
    setEditing(false);
  }, [current]);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [save, cancel],
  );

  return { editing, value, setValue, startEditing, save, cancel, onKeyDown };
}
