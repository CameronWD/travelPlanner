"use client";

import * as React from "react";
import { useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { previewStopDeletion, deleteStop } from "@/server/actions/stops";
import type { StopDeletionPreview } from "@/server/actions/stops";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";

// ---------------------------------------------------------------------------
// Inner dialog body — only rendered when open=true (remount-on-open pattern,
// mirrors PromoteForkDialogInner: resets all state on every open with no
// setState-in-effect).
// ---------------------------------------------------------------------------

interface InnerProps {
  stopId: string;
  stopName: string;
  onClose: () => void;
}

function firstErrorMessage(errors: Record<string, string[]> | undefined, fallback: string): string {
  const first = errors ? Object.values(errors).flat()[0] : undefined;
  return first ?? fallback;
}

function DeleteStopDialogInner({ stopId, stopName, onClose }: InnerProps) {
  const [preview, setPreview] = React.useState<StopDeletionPreview | null>(null);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
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
          setFetchError(firstErrorMessage(result.errors, "Couldn't load preview."));
        }
      } catch {
        setFetchError("Could not load preview. Please try again.");
      }
    })();
  }, [stopId]);

  const [isPending, startTransition] = useTransition();

  const hasLosses =
    !!preview &&
    (preview.accommodations.length > 0 ||
      preview.unpaidCosts.length > 0 ||
      preview.attachmentCount > 0 ||
      preview.noteCount > 0);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteStop(stopId);
      if (!result.success) {
        // deleteStop resolves (never throws) on a refusal — e.g. the
        // owner-only gate, hit when this Traveller's page is stale relative
        // to a role change. Surface the server's own message.
        toast({
          variant: "destructive",
          title: firstErrorMessage(result.errors, "Couldn't delete this stop."),
        });
      }
      onClose();
    });
  }

  // Loading state
  if (!preview && !fetchError) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Delete &quot;{stopName}&quot;?</DialogTitle>
          <DialogDescription>Loading preview…</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </>
    );
  }

  // Error state — preview couldn't be loaded. Still let the Traveller delete
  // (deleteStop does its own access check), just without the loss preview.
  if (fetchError) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Delete &quot;{stopName}&quot;?</DialogTitle>
          <DialogDescription>This can&rsquo;t be undone.</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-destructive">{fetchError}</p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending} loading={isPending}>
            Delete
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete &quot;{stopName}&quot;?</DialogTitle>
        <DialogDescription>This can&rsquo;t be undone.</DialogDescription>
      </DialogHeader>

      {/* Loss list — only when non-empty */}
      {hasLosses && preview && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            Deleting this Stop will also destroy:
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
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" disabled={isPending}>
            Cancel
          </Button>
        </DialogClose>
        <Button variant="destructive" onClick={handleDelete} disabled={!preview || isPending} loading={isPending}>
          Delete
        </Button>
      </DialogFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface DeleteStopDialogProps {
  stopId: string;
  stopName: string;
  /** Controlled open state. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteStopDialog({ stopId, stopName, open, onOpenChange }: DeleteStopDialogProps) {
  function handleClose() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Remount-on-open pattern: mount the inner content only when the
            dialog is open. This resets all state (preview, fetchError, etc.)
            on every open without needing setState in an effect. */}
        {open && (
          <DeleteStopDialogInner stopId={stopId} stopName={stopName} onClose={handleClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
