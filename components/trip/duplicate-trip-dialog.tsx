"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { duplicateTrip } from "@/server/actions/trips";
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
import { toast } from "@/components/ui/use-toast";

interface DuplicateTripDialogProps {
  tripId: string;
  tripName: string;
  /** Controlled mode: caller manages open state. When provided, the built-in trigger button is NOT rendered. */
  open?: boolean;
  /** Controlled mode: called when the dialog wants to open or close. */
  onOpenChange?: (open: boolean) => void;
  /** When true, uses neutral workspace-safe copy instead of trip-specific wording. */
  disguised?: boolean;
}

export function DuplicateTripDialog({
  tripId,
  tripName,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  disguised = false,
}: DuplicateTripDialogProps) {
  const router = useRouter();
  const isControlled = controlledOpen !== undefined;

  // Uncontrolled internal state (only used when not in controlled mode)
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const [name, setName] = React.useState(`Copy of ${tripName}`);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setName(`Copy of ${tripName}`);
    }
    if (isControlled) {
      controlledOnOpenChange?.(newOpen);
    } else {
      setUncontrolledOpen(newOpen);
    }
  }

  function handleDuplicate() {
    startTransition(async () => {
      const res = await duplicateTrip(tripId, name);
      if (res.success) {
        router.push(`/trips/${res.tripId}`);
      } else {
        toast({ title: "Couldn't duplicate", variant: "destructive" });
        handleOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline" size="md">
            <Copy className="size-4" aria-hidden="true" />
            Duplicate trip
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{disguised ? "Duplicate this project?" : "Duplicate this trip?"}</DialogTitle>
          <DialogDescription>
            {disguised
              ? "Collaborators will be added too."
              : "Your co-travellers will be added to the duplicate too."}
          </DialogDescription>
        </DialogHeader>

        <Field label="Name for the duplicate">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            variant="primary"
            onClick={handleDuplicate}
            disabled={!name.trim() || isPending}
            loading={isPending}
          >
            <Copy className="size-4" aria-hidden="true" />
            Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
