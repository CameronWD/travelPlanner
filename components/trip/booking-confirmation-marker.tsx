"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setNothingToAttach } from "@/server/actions/booking-confirmation";
import { useUndoableAction } from "@/components/ui/use-undoable-action";
import type { ConfirmationKind } from "@/lib/booking-confirmation";

export function BookingConfirmationMarker({ kind, id }: { kind: ConfirmationKind; id: string }) {
  const router = useRouter();
  const { run, pending } = useUndoableAction<void>({
    persist: () => setNothingToAttach(kind, id, true),
    undo: async () => {
      const result = await setNothingToAttach(kind, id, false);
      if (result.success) router.refresh();
      return result;
    },
    done: () => ({ title: "Marked as not needing a confirmation" }),
  });

  async function doesntNeedOne() {
    if (await run()) router.refresh();
  }

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <span>No booking confirmation yet</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        disabled={pending}
        onClick={doesntNeedOne}
        className="rounded-full border border-border px-2 py-0.5 font-semibold hover:bg-muted hover:text-foreground disabled:opacity-60"
      >
        Doesn’t need one
      </button>
    </p>
  );
}
