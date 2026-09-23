"use client";

import * as React from "react";
import { useTransition } from "react";
import { deleteStop } from "@/server/actions/stops";
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
import {
  useStopDeletionPreview,
  hasStopDeletionLosses,
  StopDeletionLossList,
} from "./stop-deletion-preview";

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
  const { preview, error: fetchError } = useStopDeletionPreview(stopId);
  const [isPending, startTransition] = useTransition();

  const hasLosses = hasStopDeletionLosses(preview);

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
        <StopDeletionLossList preview={preview} heading="Deleting this Stop will also destroy:" />
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
