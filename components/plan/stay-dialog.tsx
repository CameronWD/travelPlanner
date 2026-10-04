"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface StayDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  stopName: string;
  rows: React.ReactNode;
  onAdd?: () => void;
}

/** The stay dialog (spec 2026-10-04 §B): hosts the existing accommodation rows — opened from a stay panel block with that row expanded — and, optionally, "+ Add a stay". */
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
