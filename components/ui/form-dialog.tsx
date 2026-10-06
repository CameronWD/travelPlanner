"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  /** `lg` widens the dialog for a two-column form (Item, Transport, Accommodation). Defaults to the standard width. */
  size?: "md" | "lg";
  /**
   * The form holds unsaved input (spec 2026-10-06 §M): a backdrop tap or
   * Escape asks "Discard changes?" instead of closing. A form inside can
   * report this itself with `useFormDirty` instead.
   */
  isDirty?: boolean;
  children: React.ReactNode;
}

/** FormDialog's reporter for its form's dirtiness (a setter, not the ref, so hooks never mutate a context value). */
const FormDirtyContext = React.createContext<((dirty: boolean) => void) | null>(null);

/**
 * Report a form's dirtiness to its FormDialog (spec 2026-10-06 §M): pass
 * every field's value; dirty = differs from the first render. FormDialog
 * remounts the form on each open, so "first render" is the opened state.
 */
export function useFormDirty(values: unknown): boolean {
  const [initial] = React.useState(() => JSON.stringify(values));
  const dirty = JSON.stringify(values) !== initial;
  const report = React.useContext(FormDirtyContext);
  React.useLayoutEffect(() => {
    if (!report) return;
    report(dirty);
    return () => report(false);
  }, [report, dirty]);
  return dirty;
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
  size,
  isDirty = false,
  children,
}: FormDialogProps) {
  const formKey = open ? `${recordId ?? "new"}-open` : "closed";
  const reported = React.useRef(false);
  const report = React.useCallback((dirty: boolean) => {
    reported.current = dirty;
  }, []);
  const confirmId = React.useId();
  const [confirming, setConfirming] = React.useState(false);
  const [seenOpen, setSeenOpen] = React.useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (!open) setConfirming(false);
  }

  // A stray backdrop tap or Escape on unsaved input asks first (spec §M).
  function guard(e: Event) {
    if (!(isDirty || reported.current)) return;
    e.preventDefault();
    setConfirming(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={size} onInteractOutside={guard} onEscapeKeyDown={guard}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {confirming && (
          <div
            role="alertdialog"
            aria-labelledby={confirmId}
            className="flex flex-col gap-3 rounded-xl border-2 border-border bg-sun/25 p-3.5"
          >
            <p id={confirmId} className="text-sm font-bold">Discard changes?</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" autoFocus onClick={() => setConfirming(false)}>
                Keep editing
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                Discard
              </Button>
            </div>
          </div>
        )}
        <FormDirtyContext.Provider value={report}>
          <div className="contents" key={formKey}>
            {children}
          </div>
        </FormDirtyContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
