"use client";
import * as React from "react";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";

/**
 * A toast with an Undo button. The primitive under `useUndoableAction`
 * (`@/components/ui/use-undoable-action`), which owns apply, persist, revert,
 * the Undo and their toasts — reach for the hook for an undoable write, and
 * for this directly only when there is no server call to wrap.
 */
export function toastWithUndo({
  title,
  description,
  onUndo,
  duration = 6000,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  onUndo: () => void;
  duration?: number;
}): string {
  return toast({
    title,
    description,
    duration,
    action: (
      <ToastAction altText="Undo" onClick={onUndo}>
        Undo
      </ToastAction>
    ),
  });
}
