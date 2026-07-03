"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createStop } from "@/server/actions/stops";

export interface QuickAddStopsProps {
  tripId: string;
  /** When set, new rough stops are added into this chapter. */
  chapterId?: string | null;
  /** When set, new stops are created in the given fork (variant plan). Omit or null for the real plan. */
  forkId?: string | null;
  /**
   * When set, new stops are inserted immediately after this stop (by id) rather
   * than appended at the global bottom.  Pass null to append (default behaviour).
   */
  afterStopId?: string | null;
}

/**
 * Compact inline row for rapidly adding rough stops: a place name input, a
 * small nights estimate, and an Add button. Enter submits, the place input is
 * cleared and refocused after each add for fast repeated entry.
 */
export function QuickAddStops({ tripId, chapterId, forkId, afterStopId }: QuickAddStopsProps) {
  const [name, setName] = React.useState("");
  const [nights, setNights] = React.useState("2");
  const [isPending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isPending) return;

    const parsedNights = Number.parseInt(nights, 10);
    const safeNights = Number.isFinite(parsedNights) && parsedNights >= 0 ? parsedNights : 0;

    startTransition(async () => {
      const result = await createStop(tripId, {
        mode: "rough",
        name: trimmed,
        nights: safeNights,
        ...(chapterId ? { chapterId } : {}),
      }, forkId ?? undefined, afterStopId ?? null);
      // Only clear and refocus on success — on failure, preserve the typed value
      // so the user can correct it without retyping.
      if (result && "success" in result && !result.success) {
        inputRef.current?.focus();
        return;
      }
      setName("");
      inputRef.current?.focus();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add a place…"
        aria-label="Add a place"
        disabled={isPending}
        className="flex-1"
      />
      <Input
        type="number"
        min={0}
        value={nights}
        onChange={(e) => setNights(e.target.value)}
        aria-label="Nights"
        disabled={isPending}
        className="w-20"
      />
      <Button type="submit" variant="outline" size="md" loading={isPending}>
        <Plus className="size-4" aria-hidden="true" />
        Add
      </Button>
    </form>
  );
}
