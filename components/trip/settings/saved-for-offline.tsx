"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/relative-time";
import { getServerStatus, getStatus, requestWarm, subscribe } from "@/lib/offline-status";

/**
 * The Settings row for Saved for offline (CONTEXT.md): what the warmer last
 * did for this Trip, and a "Save again" that runs it once more after more
 * planning. Reads lib/offline-status.ts; the warmer in the trip layout does
 * the work.
 */
export function SavedForOffline({ tripId }: { tripId: string }) {
  const status = React.useSyncExternalStore(subscribe, () => getStatus(tripId), getServerStatus);

  // "5m ago" has to keep pace without any store change: re-render each minute
  // while there is a timestamp to describe.
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (status.state !== "saved") return;
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [status.state]);

  const saving = status.state === "saving";
  const label = saving
    ? "Saving…"
    : status.state === "saved" && status.savedAt !== null
      ? `Saved for offline · ${relativeTime(new Date(status.savedAt))}`
      : "Not saved yet";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-sm font-medium text-foreground">
        {label}
      </p>
      <Button type="button" variant="secondary" size="sm" loading={saving} onClick={() => requestWarm(tripId)}>
        Save again
      </Button>
    </div>
  );
}
