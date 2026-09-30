"use client";

import * as React from "react";
import { BedDouble, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StayStatus } from "@/lib/plan/plan-model";

const BASE = "flex-none rounded-[14px] border-2 border-border px-3 py-1.5 text-left";

export interface StayChipProps {
  stay: StayStatus | null;
  /** A rough (date-less) stop — no accommodation to check, and not interactive. */
  rough?: boolean;
  onOpen(): void;
  onAdd(): void;
}

/** PLAN.md §4.1 stay chip: covered/partial open the stay dialog, none adds a stay, rough is inert. */
export function StayChip({ stay, rough, onOpen, onAdd }: StayChipProps) {
  if (rough || !stay) {
    return <div className={cn(BASE, "border-dashed bg-background text-[13px] font-bold text-muted-foreground")}>Needs dates first</div>;
  }

  if (stay.kind === "none") {
    return (
      <button type="button" className={cn(BASE, "pressable border-dashed bg-coral/20 text-[13px] font-bold")} onClick={onAdd}>
        No bed yet · + Add a stay
      </button>
    );
  }

  const sub =
    stay.kind === "covered"
      ? `All ${stay.totalNights} nights${stay.checkInTime ? ` · in ${stay.checkInTime}` : ""}${stay.extra ? ` · +${stay.extra} more` : ""}`
      : `${stay.coveredNights} of ${stay.totalNights} nights · Add another place`;

  return (
    <button type="button" className={cn(BASE, "pressable bg-teal/15")} onClick={onOpen}>
      <span className="flex items-center gap-1.5 text-[13px] font-bold">
        <BedDouble className="size-4" aria-hidden="true" />
        {stay.name}
      </span>
      <span className={cn("text-[11px] font-semibold", stay.kind === "covered" ? "text-teal-text" : "text-coral-text")}>
        {stay.kind === "covered" && <Check className="mr-0.5 inline size-3" aria-hidden="true" />}
        {sub}
      </span>
    </button>
  );
}

export interface StayDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  stopName: string;
  rows: React.ReactNode;
  onAdd?: () => void;
}

/** PLAN.md §4.1 stay dialog: hosts the existing accommodation rows and, optionally, "+ Add a stay". */
export function StayDialog({ open, onOpenChange, stopName, rows, onAdd }: StayDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Staying in {stopName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">{rows}</div>
        {onAdd && (
          <Button variant="outline" size="md" onClick={onAdd}>
            + Add a stay
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
