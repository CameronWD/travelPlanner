"use client";

import * as React from "react";
import { createStop } from "@/server/actions/stops";

export interface QuickAddStopsProps {
  tripId: string;
  /** When set, new rough stops are added into this chapter. */
  chapterId?: string | null;
  /**
   * Fork id for parity with the trip variant. Discreet mode always operates on
   * the real plan — pass null or omit; this prop is accepted purely for
   * interface consistency.
   */
  forkId?: string | null;
}

/**
 * Minimal discreet-mode variant of QuickAddStops. Accepts the same props as
 * the trip variant (including forkId for interface parity) but always writes to
 * the real plan — discreet mode has no active-fork context.
 */
export function QuickAddStops({ tripId, chapterId, forkId }: QuickAddStopsProps) {
  const [name, setName] = React.useState("");
  const [isPending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isPending) return;

    startTransition(async () => {
      const result = await createStop(tripId, {
        mode: "rough",
        name: trimmed,
        nights: 0,
        ...(chapterId ? { chapterId } : {}),
      }, forkId ?? undefined);
      if (result && "success" in result && !result.success) {
        inputRef.current?.focus();
        return;
      }
      setName("");
      inputRef.current?.focus();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1 text-sm">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add a place…"
        aria-label="Add a place"
        disabled={isPending}
        className="flex-1 border border-border rounded px-2 py-0.5"
      />
      <button type="submit" disabled={isPending} className="px-2 py-0.5 border border-border rounded">
        Add
      </button>
    </form>
  );
}
