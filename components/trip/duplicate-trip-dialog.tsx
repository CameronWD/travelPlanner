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
}

export function DuplicateTripDialog({
  tripId,
  tripName,
}: DuplicateTripDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(`Copy of ${tripName}`);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setName(`Copy of ${tripName}`);
    }
    setOpen(newOpen);
  }

  function handleDuplicate() {
    startTransition(async () => {
      const res = await duplicateTrip(tripId, name);
      if (res.success) {
        router.push(`/trips/${res.tripId}`);
      } else {
        toast({ title: "Couldn't duplicate", variant: "destructive" });
        setOpen(false);
      }
    });
  }

  return (
    <div>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline" size="md">
            <Copy className="size-4" aria-hidden="true" />
            Duplicate trip
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate this trip?</DialogTitle>
            <DialogDescription>
              Your co-travellers will be added to the duplicate too.
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
              disabled={!name.trim()}
              loading={isPending}
            >
              <Copy className="size-4" aria-hidden="true" />
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
