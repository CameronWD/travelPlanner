"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /**
   * The id of the record being edited, or null/undefined when adding. Combined
   * with `open` to key the inner form so all its controlled state re-seeds from
   * props whenever the dialog opens or the target record changes.
   */
  recordId?: string | null;
  children: React.ReactNode;
}

/**
 * Standard shell for an entity create/edit dialog: the Dialog + content frame,
 * a header/title, and the state-reset remount. Put a stateful inner `<XForm>`
 * (which reads its initial state from props) as the child; pair with
 * `useEntityForm` inside that form.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  recordId,
  children,
}: FormDialogProps) {
  const formKey = open ? `${recordId ?? "new"}-open` : "closed";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="contents" key={formKey}>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
