"use client";

import * as React from "react";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteTrip } from "@/server/actions/trips";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

interface DangerZoneProps {
  tripId: string;
  tripName: string;
}

export function DangerZone({ tripId, tripName }: DangerZoneProps) {
  const [open, setOpen] = React.useState(false);
  const [confirmValue, setConfirmValue] = React.useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = React.useState<string | undefined>();

  const confirmed = confirmValue.trim() === tripName.trim();

  function handleDelete() {
    if (!confirmed) return;
    setError(undefined);

    startTransition(async () => {
      const result = await deleteTrip(tripId);
      // If deleteTrip succeeds it redirects (throws), so we only land here on error.
      if (!result.success) {
        setError(result.error);
        setOpen(false);
      }
    });
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setConfirmValue("");
      setError(undefined);
    }
    setOpen(newOpen);
  }

  return (
    <div>
      {error && (
        <p className="mb-3 text-sm font-medium text-destructive">{error}</p>
      )}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline" size="md" className="border-destructive text-destructive hover:bg-destructive/5">
            <Trash2 className="size-4" aria-hidden="true" />
            Delete trip
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this trip?</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <strong className="text-foreground">{tripName}</strong> and all its
              stops, items, costs, checklists, and files. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <Field
            label={
              <>
                Type <strong>{tripName}</strong> to confirm
              </>
            }
            error={confirmValue && !confirmed ? "Name doesn't match" : undefined}
          >
            <Input
              placeholder={tripName}
              value={confirmValue}
              onChange={(e) => setConfirmValue(e.target.value)}
              disabled={isPending}
              autoComplete="off"
            />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!confirmed}
              loading={isPending}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
