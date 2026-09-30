"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { SheetOverlay, SheetPortal, sheetVariants } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useDragDismiss } from "./use-drag-dismiss";

/**
 * A Plan bottom sheet whose handle drags it closed (MOTION.md P12). It is
 * `SheetContent side="bottom"` rebuilt from sheet.tsx's own parts, because
 * that component draws a handle nobody can hand props to; the frame, slide
 * and scrolling body are the same. The scrim is 45% ink with no blur.
 *
 * The handle and the scrim are pointer-only and Escape is unreliable under
 * phone screen readers, so there is always a Close button: the ✕, or — for a
 * design with none (`hideCloseIcon`) — a screen-reader-only one.
 */
export function DragSheetContent({
  onDismiss,
  hideCloseIcon = false,
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { onDismiss(): void; hideCloseIcon?: boolean }) {
  const { handleProps } = useDragDismiss({ onDismiss });
  return (
    <SheetPortal>
      <SheetOverlay data-sheet-overlay className="bg-foreground/45 backdrop-blur-none" />
      <DialogPrimitive.Content className={cn(sheetVariants({ side: "bottom" }), className)} {...props}>
        <div
          {...handleProps}
          data-drag-handle
          aria-hidden="true"
          className="tap-target mx-auto mt-3.5 h-[5px] w-11 shrink-0 cursor-grab touch-none rounded-full bg-border"
        />
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
        <DialogPrimitive.Close
          className={
            hideCloseIcon
              ? "sr-only"
              : "absolute right-4 top-4 z-20 grid size-11 place-items-center rounded-sm border-2 border-border bg-card text-foreground"
          }
        >
          {!hideCloseIcon && <X className="size-5" strokeWidth={2.5} aria-hidden="true" />}
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}
