"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm",
      "data-[state=open]:tp-fade-in-sheet data-[state=closed]:tp-fade-out",
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "fixed z-50 flex flex-col border-border bg-background text-foreground",
  {
    variants: {
      side: {
        bottom:
          "inset-x-0 bottom-0 max-h-[90dvh] overflow-hidden rounded-t-2xl border-t-2 data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down",
        right:
          "inset-y-0 right-0 h-full w-[calc(100%-2rem)] max-w-sm overflow-hidden border-l-2 data-[state=open]:tp-slide-in-right data-[state=closed]:tp-slide-out-right",
        left: "inset-y-0 left-0 h-full w-[calc(100%-2rem)] max-w-sm overflow-hidden border-r-2 data-[state=open]:tp-slide-in-left data-[state=closed]:tp-slide-out-left",
        // Below md: a bottom sheet that grows with its content up to 90dvh
        // (LA-023 mobile). md+: the floating card beside a usable page.
        docked:
          "gap-4 p-6 inset-x-0 bottom-0 h-auto max-h-[90dvh] w-full rounded-t-2xl border-t-2 data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down " +
          "md:inset-auto md:bottom-[5.25rem] md:right-4 md:h-auto md:max-h-[min(37.5rem,calc(100vh-9rem))] md:w-[560px] md:max-w-[calc(100vw-2rem)] md:rounded-2xl md:border-2 md:shadow-hard-5",
      },
    },
    defaultVariants: {
      side: "bottom",
    },
  },
);

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  hideClose?: boolean;
  /** Suppresses the dimming backdrop. Off by default — every existing caller keeps its overlay. */
  hideOverlay?: boolean;
  /**
   * Classes for the backdrop. The overlay is `bg-foreground/40
   * backdrop-blur-sm` for everyone; a caller that wants the dim without the
   * full-viewport blur had no way to say so — `hideOverlay` is all or nothing
   * (FP-06). tailwind-merge resolves conflicts in the caller's favour, so
   * `overlayClassName="backdrop-blur-none"` does exactly that.
   */
  overlayClassName?: string;
}

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = "bottom", className, overlayClassName, children, hideClose, hideOverlay, ...props }, ref) => (
  <SheetPortal>
    {!hideOverlay ? <SheetOverlay className={overlayClassName} /> : null}
    <DialogPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {side === "docked" ? (
        children
      ) : (
        <>
          {side === "bottom" ? (
            <div
              aria-hidden="true"
              className="mx-auto mt-3.5 h-[5px] w-11 shrink-0 rounded-full bg-border"
            />
          ) : null}
          {/* Scrollable body — the frame never scrolls, so the ✕ and handle stay put (mirrors dialog.tsx). */}
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </>
      )}
      {!hideClose ? (
        <DialogPrimitive.Close
          className={cn(
            "absolute right-4 top-4 z-20 grid size-11 place-items-center rounded-sm border-2 border-border bg-card text-foreground",
          )}
        >
          <X className="size-5" strokeWidth={2.5} aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-1.5 text-left", className)} {...props} />
  );
}
SheetHeader.displayName = "SheetHeader";

function SheetFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-auto flex flex-col gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "font-display text-2xl font-extrabold leading-tight tracking-[-0.03em]",
      className,
    )}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-[13px] font-medium text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  sheetVariants,
};
