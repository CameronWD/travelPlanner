"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { SheetOverlay, SheetPortal, sheetVariants } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useDragDismiss } from "./use-drag-dismiss";

/**
 * A Plan bottom sheet whose handle drags it closed (MOTION.md P12). It is
 * `SheetContent side="bottom"` rebuilt from sheet.tsx's own parts, because
 * that component draws a handle nobody can hand props to; the frame, slide
 * and scrolling body are the same. The scrim is 45% ink with no blur.
 */
export function DragSheetContent({
  onDismiss,
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { onDismiss(): void }) {
  const { handleProps, style } = useDragDismiss({ onDismiss });
  return (
    <SheetPortal>
      <SheetOverlay data-sheet-overlay className="bg-foreground/45 backdrop-blur-none" />
      <DialogPrimitive.Content className={cn(sheetVariants({ side: "bottom" }), className)} style={style} {...props}>
        <div
          {...handleProps}
          data-drag-handle
          aria-hidden="true"
          className="tap-target mx-auto mt-3.5 h-[5px] w-11 shrink-0 cursor-grab touch-none rounded-full bg-border"
        />
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}
