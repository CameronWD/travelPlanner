"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

const ToastProvider = ToastPrimitive.Provider;

const ToastViewport = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      // The viewport itself must never be hit-testable. Radix only sets
      // pointerEvents:none on it while the stack is *empty*; with one toast on
      // screen this <ol> — z-100, w-full below md, a var(--tp-tab-bar-h)-scaled
      // amount of padding — is a live surface, and for the whole life of the
      // toast it swallows taps on the Feedback trigger
      // (components/feedback/feedback-launcher.tsx) and the trip tab bar
      // (components/trip/mobile-tab-bar.tsx) sitting underneath it. Each Toast
      // re-enables its own pointer events (pointer-events-auto in
      // toastVariants below), so the cards stay clickable, closable and
      // swipeable.
      "pointer-events-none",
      // Below md: bottom-right, above the Feedback trigger. Clearance is
      // computed from the tab bar's published height (--tp-tab-bar-h,
      // app/globals.css): bar + 1rem gap to the 2.75rem (size-11) trigger
      // + 0.5rem spare = var(--tp-tab-bar-h) + 4.25rem, carrying the same
      // env() term as the trigger so the gap can't close on a device with a
      // non-zero inset. The panel is full-screen at this size and wants its
      // toasts on top of it, so this corner stays as it is.
      //
      // From md up: bottom-**left**. The docked Feedback panel now owns the
      // bottom-right (components/ui/sheet.tsx, side="docked":
      // md:bottom-[5.25rem] md:right-4, up to 37.5rem tall). A toast on that
      // edge is exactly flush with the panel's bottom-right corner and at
      // z-100 lands on its composer — including the send-failure toast, the
      // one the user most needs to read. No clearance fixes that: the panel is
      // far taller than any offset worth using, so the toasts move to the
      // opposite corner instead. Nothing else lives bottom-left from md up —
      // the trigger is bottom-right, the tab bar is md:hidden — so the plain
      // md:bottom-4 offset is all that is needed there.
      "fixed bottom-0 right-0 z-100 flex max-h-screen w-full flex-col-reverse gap-2 p-4 pb-[calc(var(--tp-tab-bar-h)+4.25rem+env(safe-area-inset-bottom))] md:bottom-4 md:left-4 md:right-auto md:pb-4 sm:top-auto sm:max-w-sm",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

const toastVariants = cva(
  cn(
    "group pointer-events-auto relative flex w-full items-start justify-between gap-3 overflow-hidden rounded-md border-2 border-border p-4 shadow-hard-2",
    // Gate slide/fade animations behind motion-safe so reduced-motion users get no animation.
    // Note: globals.css also has a prefers-reduced-motion rule that collapses all tp-* durations
    // to 0.01ms — this motion-safe: layer makes the intent explicit at the component level.
    //
    // Entry direction has to match the viewport's corner (ToastViewport above):
    // right below md (viewport is right-anchored there — full-width below sm,
    // sm:max-w-sm flush right in the 640–768px band), left from md up (viewport
    // moves to bottom-left to clear the docked Feedback panel). The md:
    // override wins in the generated CSS despite both classes setting the same
    // `animation` property: Tailwind v4 emits the base motion-safe block before
    // the md-grouped one, so at equal specificity (one class + one attribute
    // selector each) the later, md: rule takes it whenever both its media
    // conditions (width and motion) hold — verified against the actual build
    // output rather than assumed.
    "motion-safe:data-[state=open]:tp-slide-in-right md:motion-safe:data-[state=open]:tp-slide-in-left motion-safe:data-[state=closed]:tp-toast-out",
    "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=cancel]:translate-x-0 motion-safe:data-[swipe=end]:tp-slide-out-right",
  ),
  {
    variants: {
      variant: {
        // The design's single toast look: a neutral confirmation and a
        // success read the same way, so these two collapse together.
        default: "bg-teal island",
        success: "bg-teal island",
        // `island` is deliberately NOT used here: it rescopes --foreground /
        // --muted-foreground / --border to the on-accent (ink) values, which
        // are correct for teal but wrong for destructive's white-on-red
        // (light) / near-black-on-salmon (dark) fill. Instead we rescope the
        // same three variables straight to --destructive-foreground, so
        // ToastTitle (inherits `color`), ToastDescription
        // (`text-muted-foreground`), ToastAction's border (`border-border`)
        // and ToastClose (`text-muted-foreground`, `hover:text-foreground`)
        // all resolve legibly against bg-destructive without any of those
        // components needing to know which variant they're in.
        destructive:
          "bg-destructive text-destructive-foreground [--foreground:var(--destructive-foreground)] [--muted-foreground:var(--destructive-foreground)] [--border:var(--destructive-foreground)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Toast = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(toastVariants({ variant }), className)}
    {...props}
  />
));
Toast.displayName = ToastPrimitive.Root.displayName;

const ToastTitle = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

const ToastAction = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border bg-transparent px-3 text-sm font-medium transition-colors",
      // Hover background derives from --foreground (same variable the text
      // colour comes from), not --muted: --muted is an unrescoped surface
      // token, so on an accent-filled toast (island's ink, or destructive's
      // white/near-black) a --muted patch and the on-top text would come from
      // two different colour systems and could fail contrast against each
      // other independently of the toast's own fill. Deriving both from
      // --foreground means they can never drift apart on any current or
      // future variant.
      "hover:bg-foreground/10",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitive.Action.displayName;

const ToastClose = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    aria-label="Close"
    className={cn(
      // p-3.5 (14px each side) + 16px icon = 44px total; meets the 44px touch target.
      "shrink-0 rounded-md p-3.5 text-muted-foreground transition-colors hover:text-foreground",
      // Same reasoning as ToastAction: the hover patch derives from
      // --foreground, the same variable hover:text-foreground reads, so the
      // two can't drift apart on an accent-filled toast. Not --muted, which
      // is never rescoped.
      "hover:bg-foreground/10",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      className,
    )}
    {...props}
  >
    <X className="size-4" aria-hidden="true" />
  </ToastPrimitive.Close>
));
ToastClose.displayName = ToastPrimitive.Close.displayName;

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastClose,
  toastVariants,
};
