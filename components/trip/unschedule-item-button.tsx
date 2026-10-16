"use client";

import { CalendarX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unscheduleItem, scheduleItem, rescheduleItem } from "@/server/actions/items";
import { useUndoableAction } from "@/components/ui/use-undoable-action";

export interface UnscheduleItemButtonProps {
  itemId: string;
  itemTitle: string;
  /** Pre-mutation schedule, for the undo. */
  date: string;
  startTime: string | null;
  endTime: string | null;
  /**
   * Whether the item had a stop assigned at the time of unscheduling — decides
   * the "unslotted" toast wording ("things to do" vs "Wishlist"). Derived from
   * the entry's `item.stopId` at the call site.
   */
  hadStop?: boolean;
}

/**
 * The real, reachable Unschedule control for scheduled (day-view) item rows
 * (P1-5). Mirrors the exact Task 6 `unscheduleItem` semantics for its undo:
 *
 * - "placement-removed" (a placed copy was deleted, the idea survives on the
 *   Wishlist): undo re-places a NEW copy of the surviving idea via
 *   `scheduleItem(sourceItemId, ...)`. The old row is gone by design.
 * - "unslotted" (a direct-created item had its date cleared in place, times
 *   untouched): undo restores the date in place via `rescheduleItem(itemId,
 *   date)` — NOT `scheduleItem`, which would wrongly copy it.
 */
export function UnscheduleItemButton({
  itemId,
  itemTitle,
  date,
  startTime,
  endTime,
  hadStop = false,
}: UnscheduleItemButtonProps) {
  // The result's `mode` decides both the toast and which inverse the Undo runs.
  const unschedule = useUndoableAction({
    persist: (id: string) => unscheduleItem(id),
    undo: (id, result) => {
      if (result.mode === "placement-removed") {
        if (!result.sourceItemId) throw new Error("Missing sourceItemId for placement-removed undo");
        return scheduleItem(result.sourceItemId, {
          date,
          ...(startTime ? { startTime } : {}),
          ...(endTime ? { endTime } : {}),
        });
      }
      return rescheduleItem(id, date);
    },
    done: (_id, result) =>
      result.mode === "placement-removed"
        ? { title: "Removed from this plan", description: `${itemTitle} is still on the Wishlist` }
        : { title: hadStop ? "Moved to things to do" : "Moved to Wishlist" },
    failure: "Couldn't unschedule.",
  });

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
      disabled={unschedule.pending}
      onClick={() => void unschedule.run(itemId)}
      title="Unschedule"
    >
      <CalendarX className="size-3.5" aria-hidden="true" />
      {/* Icon-only below sm — the full label plus the title/category pill
          overflows a day-view item row at 320–374px viewports; the `title`
          attribute above keeps "Unschedule" as the accessible name either way. */}
      <span className="hidden sm:inline">Unschedule</span>
    </Button>
  );
}
