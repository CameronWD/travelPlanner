"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { SPRING_POP } from "@/lib/motion";

/* Restyle only: same exports and props as before. Mobile = bottom sheet, sm+ = centred dialog. */
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
    className={cn("fixed inset-0 z-50 bg-[hsl(30_4%_11%/0.35)]", "data-[state=open]:tp-fade-in-sheet data-[state=closed]:tp-fade-out", className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/** Breathing room kept between a focused field and the sticky header/footer. */
const FOCUS_GAP = 16;

/*
 * LA-011 (Stage 2). The sticky header and footer sit *inside* the scroll body,
 * so a field partly hidden under either still intersects the scrollport, and
 * the browser's focus scrolling ("only if not visible") treats it as visible:
 * tapping or tabbing to the Notes box peeking above Cancel/Save scrolls
 * nothing and leaves it under the footer (measured in-browser at 390×844:
 * bottom 799 vs footer top 744 after focus). Scrolled to the end, content
 * already clears the footer — only focus needed fixing. On focus, nudge the
 * scroll body by exactly the overlap measured against the real header/footer
 * boxes, so it holds for any footer height (wrapped buttons included).
 */
function revealFocusedField(event: React.FocusEvent<HTMLDivElement>) {
  const body = event.currentTarget;
  const field = event.target as HTMLElement;
  const header = body.querySelector<HTMLElement>('[data-slot="dialog-header"]');
  const footer = body.querySelector<HTMLElement>('[data-slot="dialog-footer"]');
  if (header?.contains(field) || footer?.contains(field)) return;
  if (typeof body.scrollBy !== "function") return;

  // Reveal the control's whole Field — its hint and error render *below* the
  // control, so clearing only the control can leave them under the footer.
  const wrapper = field.closest<HTMLElement>('[data-slot="field"]');
  const box = (wrapper && body.contains(wrapper) ? wrapper : field).getBoundingClientRect();
  const bodyBox = body.getBoundingClientRect();
  const headerEdge = header ? header.getBoundingClientRect().bottom : bodyBox.top;
  const footerEdge = footer ? footer.getBoundingClientRect().top : bodyBox.bottom;

  if (box.bottom > footerEdge) {
    // Under the footer: scroll up by the overlap plus a gap, but never so far
    // that a tall field's top slides under the header.
    const room = Math.max(0, box.top - headerEdge - FOCUS_GAP);
    const delta = Math.min(box.bottom - footerEdge + FOCUS_GAP, room);
    if (delta > 0) body.scrollBy({ top: delta });
  } else if (box.top < headerEdge) {
    body.scrollBy({ top: box.top - headerEdge - FOCUS_GAP });
  }
}

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideClose?: boolean;
    bare?: boolean;
    /** `lg` widens the centred (sm+) dialog for two-column entity forms. The phone bottom sheet is unaffected. */
    size?: "md" | "lg";
  }
>(({ className, children, hideClose, bare, size = "md", ...props }, ref) => {
  const reduce = useReducedMotion();
  const body = bare ? (
    children
  ) : (
    <>
      <div aria-hidden="true" className="mx-auto mt-3.5 h-[5px] w-11 shrink-0 rounded-full bg-border sm:hidden" />
      <div onFocus={revealFocusedField} className="flex flex-col gap-3.5 overflow-y-auto scroll-pb-24 px-[18px] pb-[calc(1.375rem+env(safe-area-inset-bottom))] pt-3.5 sm:px-6 sm:pt-6">{children}</div>
    </>
  );

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden border-2 border-border bg-background text-foreground",
          "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl border-b-0",
          // The phone bottom sheet's slide stays plain CSS either way.
          "data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-h-[85vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border-b-2 sm:shadow-hard-5",
          size === "lg" ? "sm:max-w-dialog-lg" : "sm:max-w-dialog",
          // The desktop (sm+) open pop is a Motion spring (SPRING_POP, below)
          // when motion is allowed. tp-pop-in is kept only as the
          // reduced-motion fallback, so the dialog still appears — instantly,
          // since prefers-reduced-motion collapses --dur-slow to ~0 (see
          // app/globals.css) rather than not animating at all. The close
          // animation (tp-pop-out) is unchanged in both cases: Radix detects
          // the exit via this CSS animation ending, so it stays CSS-driven.
          reduce && "sm:data-[state=open]:tp-pop-in",
          "sm:data-[state=closed]:tp-pop-out",
          className,
        )}
        {...props}
      >
        <motion.div
          className="flex min-h-0 flex-1 flex-col"
          initial={reduce ? false : { scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING_POP}
        >
          {body}
        </motion.div>
        {!hideClose ? (
          <DialogPrimitive.Close className="absolute right-4 top-4 z-20 grid size-11 place-items-center rounded-sm border-2 border-border bg-card text-foreground sm:right-5 sm:top-5">
            <X className="size-5" strokeWidth={2.5} aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // Top inset ownership (LA-024 fix round 2): the scroll body (DialogContent)
  // owns the *only* top padding (pt-3.5/sm:pt-6) — the header carries none of
  // its own, so there's nothing to cancel and no negative top margin anywhere
  // near a sticky element. That negative margin used to bleed the header
  // through the scroll body's own padding so the header's title sat 14/24px
  // down while its background still reached the true top edge; but a sticky
  // flex item's *rendered* position at rest doesn't reflect a negative top
  // margin the way a static/relative item's would (verified in-browser —
  // Chromium keeps the flex track's gap reservation as if the margin
  // applied, but paints the sticky box lower, by the margin's own
  // magnitude), so the reserved gap-3.5/mb-1 space undershot by exactly that
  // margin and the header could overlap the block after it (worst with a
  // short eyebrow like "Current members", whose glyphs sit closer to its
  // line-box edge). Giving the scroll body sole ownership sidesteps the bug
  // instead of working around it: at rest the header sits pt-3.5/pt-6 below
  // the true edge (its normal flex-flow position — gap-3.5/mb-1 measured
  // correct in-browser, no more shortfall). Per spec, scrolling that same
  // 14/24px should engage `sticky`'s own top-0 constraint and dock it flush
  // at the true edge from then on, without a jump (it only ever reaches
  // that edge, never overshoots it) — the at-rest geometry above is verified
  // in-browser, but this environment's headless Chromium doesn't visibly
  // move a `position: sticky` element on programmatic or synthetic-wheel
  // scroll at all (confirmed on the pre-fix code too, so it's a harness
  // limitation, not a regression), so the actual engage/dock transition
  // during a real scroll is unverified here.
  //
  // before: sized to that same 14/24px, so it now covers exactly the padding
  // strip between the header and the true edge — at rest that strip is
  // already the scroll body's own (borderless, backgroundless) padding
  // showing DialogContent's own bg-background through it, so this is a
  // belt-and-braces cover for iOS elastic/rubber-band overscroll rather than
  // load-bearing (verified the geometry above in-browser; iOS's own bounce
  // physics aren't reproducible in this environment, so the overscroll case
  // itself is unverified on a real device).
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "sticky top-0 z-10 shrink-0 -mx-[18px] mb-1 flex min-h-[72px] flex-col justify-center gap-1 bg-background px-[18px] pr-16 text-left sm:-mx-6 sm:px-6",
        "before:content-[''] before:absolute before:inset-x-0 before:bottom-full before:h-3.5 before:bg-background sm:before:h-6",
        className,
      )}
      {...props}
    />
  );
}
DialogHeader.displayName = "DialogHeader";

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // after: covers the gap the negative bottom margin opens below the sticky
  // footer during elastic/rubber-band overscroll on iOS Safari.
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "sticky bottom-0 z-10 -mx-[18px] -mb-[calc(1.375rem+env(safe-area-inset-bottom))] mt-2 bg-background px-[18px] pb-[calc(1.375rem+env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:px-6",
        "after:content-[''] after:absolute after:inset-x-0 after:top-full after:h-[calc(1.375rem+env(safe-area-inset-bottom))] after:bg-background",
        "flex flex-row flex-wrap gap-2 [&>*]:flex-1 [&>*]:min-w-[8rem] [&>*]:whitespace-normal sm:justify-end sm:[&>*]:flex-initial",
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
  <DialogPrimitive.Title ref={ref} className={cn("font-display text-2xl font-extrabold leading-tight tracking-[-0.03em]", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-[13px] font-medium text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export { Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
