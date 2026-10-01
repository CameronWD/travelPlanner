"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/relative-time";
import { getServerStatus, getStatus, requestWarm, subscribe } from "@/lib/offline-status";
import { toast } from "@/components/ui/use-toast";
import { failureMessage } from "@/components/ui/failure-message";

// Its own literal so the help guide's drift guard (lib/help-guide.ts,
// GUIDE_UI_STRINGS) finds the quoted phrase whole, not mid-template.
const SAVED_LABEL = "Saved for offline";
const SAVE_FAILED = "Couldn't save for offline. Try again.";

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

  // Mirrors useOnlineStatus's SSR-safe default (assume online until
  // mounted): assume the SW controls the page until the effect below can
  // check, so this row doesn't flash the "needs the installed app" hint on
  // every load before correcting itself.
  const [controlled, setControlled] = React.useState(true);
  React.useEffect(() => {
    // Same feature check as the warmer (components/offline-warmer.tsx): "in"
    // rather than optional chaining, since the property itself may not exist.
    // Named + invoked (matching useOnlineStatus's own shape) rather than a
    // bare setState call, which react-hooks/set-state-in-effect flags.
    const update = () => setControlled("serviceWorker" in navigator && Boolean(navigator.serviceWorker.controller));
    update();
  }, []);

  const saving = status.state === "saving";
  const label = saving
    ? "Saving…"
    : status.state === "saved" && status.savedAt !== null
      ? `${SAVED_LABEL} · ${relativeTime(new Date(status.savedAt))}`
      : "Not saved yet";

  const handleSaveAgain = () => {
    // Read at click time, same as failureMessage's own contract — this can't
    // run without a connection, so say so instead of silently doing nothing.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast({ variant: "destructive", title: failureMessage(SAVE_FAILED) });
      return;
    }
    requestWarm(tripId);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <p role="status" className="text-sm font-medium text-foreground">
          {label}
        </p>
        {!controlled && (
          <p className="text-xs text-muted-foreground">Offline saving needs the installed app.</p>
        )}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={saving}
        disabled={!controlled || saving}
        onClick={handleSaveAgain}
      >
        Save again
      </Button>
    </div>
  );
}
