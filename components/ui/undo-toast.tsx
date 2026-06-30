"use client";
import * as React from "react";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";

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
