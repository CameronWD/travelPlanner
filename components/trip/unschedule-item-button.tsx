"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unscheduleItem, scheduleItem, rescheduleItem } from "@/server/actions/items";
import { toastWithUndo } from "@/components/ui/undo-toast";
import { toast } from "@/components/ui/use-toast";

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
  const router = useRouter();
  const [isPending, setIsPending] = React.useState(false);

  async function handleClick() {
    setIsPending(true);
    try {
      const result = await unscheduleItem(itemId);
      if (!result.success) {
        toast({ title: "Couldn't unschedule", variant: "destructive" });
        return;
      }

      if (result.mode === "placement-removed") {
        const sourceItemId = result.sourceItemId;
        toastWithUndo({
          title: "Removed from this plan",
          description: `${itemTitle} is still on the Wishlist`,
          onUndo: async () => {
            try {
              if (!sourceItemId) throw new Error("Missing sourceItemId for placement-removed undo");
              const result = await scheduleItem(sourceItemId, {
                date,
                ...(startTime ? { startTime } : {}),
                ...(endTime ? { endTime } : {}),
              });
              if (!result.success) {
                toast({ title: "Couldn't undo", variant: "destructive" });
                return;
              }
              router.refresh();
            } catch {
              toast({ title: "Couldn't undo", variant: "destructive" });
            }
          },
        });
      } else {
        toastWithUndo({
          title: hadStop ? "Moved to things to do" : "Moved to Wishlist",
          onUndo: async () => {
            try {
              const result = await rescheduleItem(itemId, date);
              if (!result.success) {
                toast({ title: "Couldn't undo", variant: "destructive" });
                return;
              }
              router.refresh();
            } catch {
              toast({ title: "Couldn't undo", variant: "destructive" });
            }
          },
        });
      }

      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
      disabled={isPending}
      onClick={handleClick}
      title="Unschedule"
    >
      <CalendarX className="size-3.5" aria-hidden="true" />
      Unschedule
    </Button>
  );
}
