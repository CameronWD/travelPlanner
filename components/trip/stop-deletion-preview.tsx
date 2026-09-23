"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { previewStopDeletion } from "@/server/actions/stops";
import type { StopDeletionPreview } from "@/server/actions/stops";
import { formatMoney } from "@/lib/money";

export type { StopDeletionPreview };

/**
 * Shared by every confirm flow that can destroy a Stop (ARCH-DAT-4):
 * `DeleteStopDialog` (the itinerary's own Delete control) and Make it fit's
 * "drop a stop" — both fetch and render the SAME itemisation from the SAME
 * source, rather than each growing its own copy of this logic.
 */

function firstErrorMessage(errors: Record<string, string[]> | undefined, fallback: string): string {
  const first = errors ? Object.values(errors).flat()[0] : undefined;
  return first ?? fallback;
}

/**
 * Fetch-once-on-mount loss preview for a Stop pending deletion. Never
 * re-fetches on `stopId` identity churn within one mounted instance — callers
 * that need a fresh preview for a different Stop should remount (both current
 * callers do: DeleteStopDialog and Make it fit's drop confirm each mount a
 * fresh instance per open, keyed by the target Stop).
 */
export function useStopDeletionPreview(stopId: string): {
  preview: StopDeletionPreview | null;
  error: string | null;
} {
  const [preview, setPreview] = React.useState<StopDeletionPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fetched = React.useRef(false);

  React.useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    // Async IIFE — state updates happen asynchronously, never synchronously
    // inside the effect body (react-hooks/set-state-in-effect compliance).
    void (async () => {
      try {
        const result = await previewStopDeletion(stopId);
        if (result.success) {
          setPreview(result.preview);
        } else {
          setError(firstErrorMessage(result.errors, "Couldn't load preview."));
        }
      } catch {
        setError("Could not load preview. Please try again.");
      }
    })();
  }, [stopId]);

  return { preview, error };
}

/** Whether a preview has anything worth warning about. */
export function hasStopDeletionLosses(preview: StopDeletionPreview | null): boolean {
  return (
    !!preview &&
    (preview.accommodations.length > 0 ||
      preview.unpaidCosts.length > 0 ||
      preview.attachmentCount > 0 ||
      preview.noteCount > 0)
  );
}

export interface StopDeletionLossListProps {
  preview: StopDeletionPreview;
  /**
   * Verb-specific lead-in, e.g. "Deleting this Stop will also destroy:" vs
   * "Dropping this Stop will also destroy:" — the itemisation below it is
   * identical either way.
   */
  heading: string;
}

/**
 * The itemised loss list itself — the one place this renders. Deliberately
 * reports whether an Accommodation holds a confirmation number, never the
 * value (ARCH-TEN-7): `preview.accommodations[].hasConfirmation` is already a
 * boolean by the time it reaches here.
 */
export function StopDeletionLossList({ preview, heading }: StopDeletionLossListProps) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        {heading}
      </div>
      <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        {preview.accommodations.map((acc) => (
          <li key={acc.id} className="flex items-start gap-2 min-w-0">
            <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">
              Accommodation
            </span>
            <span className="min-w-0 truncate text-foreground">
              {acc.name}
              {acc.hasConfirmation ? " — holds a confirmation number" : ""}
            </span>
          </li>
        ))}
        {preview.unpaidCosts.map((cost) => (
          <li key={cost.id} className="flex items-start gap-2 min-w-0">
            <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">
              Unpaid cost
            </span>
            <span className="min-w-0 truncate text-foreground">
              {cost.label ?? "Cost"} ({formatMoney(cost.costMinor, cost.currency)})
            </span>
          </li>
        ))}
        {preview.attachmentCount > 0 && (
          <li className="flex items-start gap-2 min-w-0">
            <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">
              Attachment{preview.attachmentCount === 1 ? "" : "s"}
            </span>
            <span className="min-w-0 truncate text-foreground">
              {preview.attachmentCount} {preview.attachmentCount === 1 ? "file" : "files"}
            </span>
          </li>
        )}
        {preview.noteCount > 0 && (
          <li className="flex items-start gap-2 min-w-0">
            <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">
              Note{preview.noteCount === 1 ? "" : "s"}
            </span>
            <span className="min-w-0 truncate text-foreground">
              {preview.noteCount} {preview.noteCount === 1 ? "note" : "notes"}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
