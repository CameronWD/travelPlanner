"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useKeyboardViewport } from "./use-keyboard-viewport";

// The `docked` variant switches from phone bottom sheet to desktop card at
// Tailwind's `md`. Same useSyncExternalStore pattern as dialog.tsx's sm gate:
// server snapshot false (phone), client value settles on the first render.
const DOCKED_DESKTOP_QUERY = "(min-width: 768px)";

function subscribeDockedDesktopQuery(callback: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(DOCKED_DESKTOP_QUERY);
  // Safari 12/13's MediaQueryList has only addListener (see feedback-launcher's
  // useDockedViewport): skip live tracking there rather than throw.
  if (typeof mql.addEventListener !== "function") return () => {};
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getDockedDesktopSnapshot() {
  return typeof window !== "undefined" && window.matchMedia ? window.matchMedia(DOCKED_DESKTOP_QUERY).matches : false;
}

function getDockedDesktopServerSnapshot() {
  return false;
}

function useIsDockedDesktop() {
  return React.useSyncExternalStore(subscribeDockedDesktopQuery, getDockedDesktopSnapshot, getDockedDesktopServerSnapshot);
}

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
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
          "inset-x-0 bottom-0 max-h-[90dvh] overflow-hidden supports-[overflow:clip]:overflow-clip rounded-t-2xl border-t-2 data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down",
        right:
          "inset-y-0 right-0 h-full w-[calc(100%-2rem)] max-w-sm overflow-hidden supports-[overflow:clip]:overflow-clip border-l-2 data-[state=open]:tp-slide-in-right data-[state=closed]:tp-slide-out-right",
        left: "inset-y-0 left-0 h-full w-[calc(100%-2rem)] max-w-sm overflow-hidden supports-[overflow:clip]:overflow-clip border-r-2 data-[state=open]:tp-slide-in-left data-[state=closed]:tp-slide-out-left",
        // Below md: a bottom sheet that grows with its content up to 90dvh
        // (LA-023 mobile). md+: the floating card beside a usable page, sized
        // to content; its cap keeps the FP-13 16rem floor on short windows.
        docked:
          "gap-4 p-6 inset-x-0 bottom-0 h-auto max-h-[90dvh] w-full rounded-t-2xl border-t-2 data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down " +
          "md:inset-auto md:bottom-[5.25rem] md:right-4 md:h-auto md:max-h-[min(37.5rem,max(16rem,calc(100vh-9rem)))] md:w-[560px] md:max-w-[calc(100vw-2rem)] md:rounded-2xl md:border-2 md:shadow-hard-5",
      },
    },
    defaultVariants: {
      side: "bottom",
    },
  },
);

interface SheetContentProps
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

/*
 * The content frame itself, rendered under SheetPortal, whose Presence mounts
 * it only while the sheet is open (or animating out) — so the visualViewport
 * subscription lives exactly as long as the open sheet and every reopen
 * starts keyboard-closed (mirrors DialogSheet in dialog.tsx).
 */
const SheetFrame = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  Omit<SheetContentProps, "overlayClassName" | "hideOverlay">
>(({ side = "bottom", className, children, hideClose, style, ...props }, ref) => {
  /*
   * Phone keyboard (spec 2026-10-11-phone-keyboard-sheets). iOS Safari lays
   * the keyboard over the page without shrinking dvh, so a phone bottom
   * sheet kept its 90dvh and its lower part sat behind the keyboard. While
   * the keyboard is open the phone sheets sit on it instead — inline
   * `bottom` = the keyboard's inset, `max-height` = the visible area — and
   * `data-keyboard="open"` drives the compact classes through `group/sheet`.
   * Only `bottom` (phone-only UI, no desktop variant) and `docked` below md
   * subscribe; `right`/`left` and the md+ docked card never do, so their
   * classes and style are untouched. Keyboard closed (or no visualViewport)
   * renders today's sheet exactly.
   */
  const isDockedDesktop = useIsDockedDesktop();
  const keyboardAware = side === "bottom" || (side === "docked" && !isDockedDesktop);
  const kb = useKeyboardViewport(keyboardAware);
  const keyboard = keyboardAware && kb.keyboardOpen;
  const contentStyle: React.CSSProperties | undefined = keyboard
    ? { ...style, bottom: kb.bottomInset, maxHeight: kb.visibleHeight }
    : style;

  return (
    <DialogPrimitive.Content
      ref={ref}
      data-keyboard={keyboard ? "open" : undefined}
      style={contentStyle}
      className={cn(
        sheetVariants({ side }),
        keyboardAware && "group/sheet",
        className,
        // The docked sheet has no scroll body of its own, so its frame drops
        // the safe-area part of any bottom padding (the keyboard covers the
        // home indicator). Last, so tailwind-merge overrides a caller's pb.
        keyboard && side === "docked" && "pb-6",
      )}
      {...props}
    >
      {side === "docked" ? (
        children
      ) : (
        <>
          {side === "bottom" ? (
            <div
              aria-hidden="true"
              className="mx-auto mt-3.5 h-[5px] w-11 shrink-0 rounded-full bg-border group-data-[keyboard=open]/sheet:hidden"
            />
          ) : null}
          {/* Scrollable body — the frame never scrolls, so the ✕ and handle stay put (mirrors dialog.tsx).
              `relative` anchors sr-only controls here so focusing one scrolls this body, not the frame (spec 2026-10-04 §G).
              With the phone keyboard open the keyboard covers the home indicator, so the bottom padding drops its safe-area part. */}
          <div className="relative flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] group-data-[keyboard=open]/sheet:pb-6">
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
  );
});
SheetFrame.displayName = "SheetFrame";

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ overlayClassName, hideOverlay, ...props }, ref) => (
  <SheetPortal>
    {!hideOverlay ? <SheetOverlay className={overlayClassName} /> : null}
    <SheetFrame ref={ref} {...props} />
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
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  sheetVariants,
};
