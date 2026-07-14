"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm",
      "data-[state=open]:tp-fade-in data-[state=closed]:tp-fade-out",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Hide the built-in close button. */
    hideClose?: boolean;
    /**
     * Skip the padded inner wrapper and mobile grab handle entirely.
     * Use this for custom-layout dialogs (e.g. command palette) that manage
     * their own padding, sticky headers, and scroll containers.
     * When false (default) the behaviour is byte-identical to before.
     */
    bare?: boolean;
  }
>(({ className, children, hideClose, bare, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Frame: column layout, height-capped, NOT itself the scroll container.
        "fixed z-50 flex flex-col overflow-hidden border-border bg-card text-card-foreground shadow-soft-lg",
        // Mobile (default): bottom sheet anchored to the bottom edge.
        "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl border-t",
        "data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down",
        // Desktop (sm+): centered modal.
        "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-w-lg sm:max-h-[85vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border",
        "sm:data-[state=open]:tp-pop-in sm:data-[state=closed]:tp-pop-out",
        className,
      )}
      {...props}
    >
      {bare ? (
        children
      ) : (
        <>
          {/* Mobile grab handle (decorative) */}
          <div
            aria-hidden="true"
            className="mx-auto mt-1 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30 sm:hidden"
          />
          {/* Scrollable body — the frame above never scrolls, so the ✕ stays put. */}
          <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:pt-6">
            {children}
          </div>
        </>
      )}
      {!hideClose ? (
        <DialogPrimitive.Close
          className={cn(
            "absolute right-4 top-4 z-20 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 -mx-6 -mt-4 flex flex-col gap-1.5 border-b border-border/60 bg-card px-6 pr-10 pb-4 pt-4 text-left sm:-mt-6 sm:pt-6 sm:pb-3 before:content-[''] before:absolute before:inset-x-0 before:bottom-full before:h-4 before:bg-card sm:before:h-6",
        className,
      )}
      {...props}
    />
  );
}
DialogHeader.displayName = "DialogHeader";

function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // Buttons sit side-by-side (DOM order Cancel → primary, so the primary
        // is on the right and focus order is natural).
        // Mobile (bottom sheet): split the width equally (flex-1) for large,
        // balanced tap targets. Desktop (sm+): natural width, right-aligned.
        "flex flex-row gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-initial",
        className,
      )}
      {...props}
    />
  );
}
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "font-display text-xl font-semibold leading-tight tracking-tight",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
