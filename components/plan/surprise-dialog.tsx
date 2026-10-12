"use client";

import * as React from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { travellerFirstName, type TravellerLike } from "@/lib/traveller";

export interface SurpriseDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  members: readonly TravellerLike[];
  currentUserId: string;
  /** Who starts ticked (CONTEXT.md **Surprise**: everyone else on the Trip unless the planner says otherwise). */
  initialForIds: readonly string[];
  /** The Stop or Item being made a Surprise, named in the description. */
  label: string;
  onConfirm(forIds: string[]): void;
}

/** "Surprise for…": the planner picks who is surprised. The planner is never on the list. */
export function SurpriseDialog({
  open,
  onOpenChange,
  members,
  currentUserId,
  initialForIds,
  label,
  onConfirm,
}: SurpriseDialogProps) {
  const others = members.filter((m) => m.id !== currentUserId);
  const [forIds, setForIds] = React.useState<string[]>(() => [...initialForIds]);
  const [wasOpen, setWasOpen] = React.useState(open);
  // Reopening starts from the caller's ticks again (state reset during render, not in an effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForIds([...initialForIds]);
  }

  const toggle = (id: string, on: boolean) =>
    setForIds((prev) => (on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)));
  const chosen = others.map((m) => m.id).filter((id) => forIds.includes(id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Surprise for…</DialogTitle>
          <DialogDescription>Who shouldn&apos;t see inside {label}? You can always see it.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col">
          {others.map((m) => (
            <Checkbox
              key={m.id}
              strike={false}
              label={travellerFirstName(m)}
              checked={forIds.includes(m.id)}
              onChange={(e) => toggle(m.id, e.target.checked)}
            />
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="primary" disabled={chosen.length === 0} onClick={() => onConfirm(chosen)}>
            Make it a surprise
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
