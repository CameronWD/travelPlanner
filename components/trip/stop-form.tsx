"use client";

/**
 * stop-form.tsx
 *
 * Exports trigger-button components for opening the Stop form dialog.
 * The actual form lives in stop-form-dialog.tsx to keep this file focused
 * on the trigger UX surface.
 *
 * Usage:
 *   <AddStopButton tripId={tripId} />          // primary "Add stop" button
 *   <EditStopButton tripId={tripId} stop={s} /> // icon button per card
 */

import * as React from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StopFormDialog } from "./stop-form-dialog";
import type { StopCardStop } from "./stop-card";

// ---------------------------------------------------------------------------
// Add stop trigger
// ---------------------------------------------------------------------------

export function AddStopButton({ tripId }: { tripId: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="primary" size="md" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        Add stop
      </Button>
      <StopFormDialog tripId={tripId} open={open} onOpenChange={setOpen} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Edit stop trigger (used per-card)
// ---------------------------------------------------------------------------

export function EditStopButton({
  tripId,
  stop,
}: {
  tripId: string;
  stop: StopCardStop;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${stop.name}`}
        title="Edit stop"
      >
        <Pencil className="size-4" aria-hidden="true" />
      </Button>
      <StopFormDialog
        tripId={tripId}
        stop={stop}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
