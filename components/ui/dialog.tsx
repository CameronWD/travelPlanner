"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { SPRING_POP } from "@/lib/motion";
import { trackScrollEdges } from "./scroll-edges";
import { useKeyboardViewport } from "./use-keyboard-viewport";

// Gates the spring pop to the sm+ (desktop) centred dialog — the phone
// bottom sheet keeps its plain CSS slide, unchanged by this task. Reactive
// (not a one-shot check) via useSyncExternalStore, mirroring the resolveView
// external-store pattern in calendar-views.tsx; the server snapshot is
// `false` so SSR always matches the phone layout, and the client value
// settles synchronously on the first client render (no flash).
const DESKTOP_QUERY = "(min-width: 640px)";

function subscribeDesktopQuery(callback: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getDesktopSnapshot() {
  return typeof window !== "undefined" && window.matchMedia ? window.matchMedia(DESKTOP_QUERY).matches : false;
}

function getDesktopServerSnapshot() {
  return false;
}

function useIsDesktopDialog() {
  return React.useSyncExternalStore(subscribeDesktopQuery, getDesktopSnapshot, getDesktopServerSnapshot);
}

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
 * Called on focus, and once more when the phone keyboard opens and the sheet
 * shrinks around the already-focused field (spec 2026-10-11-phone-keyboard-sheets).
 */
function revealFocusedField(body: HTMLElement, field: HTMLElement) {
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

/** The centred (sm+) width per `size`. `full` also owns its phone geometry: edge-to-edge, not a 90dvh sheet. */
const SIZE_CLASS = {
  md: "sm:max-w-dialog",
  lg: "sm:max-w-dialog-lg",
  full: "max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none sm:h-[92vh] sm:max-h-[92vh] sm:w-[92vw]",
} as const;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  hideClose?: boolean;
  bare?: boolean;
  /**
   * `lg` widens the centred (sm+) dialog for two-column entity forms; the phone bottom sheet is unaffected.
   * `full` is near-full-screen — 92vw × 92vh from sm, edge-to-edge below it — and stretches the scroll
   * body to the dialog's height, so one `flex-1` child (the Plan's Route map) fills it.
   */
  size?: "md" | "lg" | "full";
};

/*
 * The content frame itself. Rendered as a child of DialogPortal, whose
 * Presence mounts it only while the dialog is open (or animating out), so its
 * hooks — the visualViewport subscription in particular — live exactly as
 * long as the open sheet: a closed Dialog subscribes to nothing, and every
 * reopen starts from a fresh, keyboard-closed state rather than whatever the
 * last open left behind (spec 2026-10-11-phone-keyboard-sheets, Review Focus 1).
 */
const DialogSheet = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, hideClose, bare, size = "md", style, ...props }, ref) => {
  const reduce = useReducedMotion();
  const isDesktop = useIsDesktopDialog();
  // Only the desktop (sm+) pop gets the spring — the phone bottom sheet
  // keeps its plain CSS slide-up untouched, unaffected by either flag.
  const spring = isDesktop && !reduce;

  /*
   * Phone keyboard (spec 2026-10-11-phone-keyboard-sheets). iOS Safari lays
   * the keyboard over the page without shrinking the layout viewport or dvh,
   * so the 90dvh sheet (100dvh for `full`) kept its height, its lower part
   * sat behind the keyboard, and only a strip of form showed between the
   * sticky header and footer. While the keyboard is open the phone sheet
   * sits on it instead — inline `bottom` = the keyboard's inset, max-height
   * (and `full`'s height) = the visible area — and `data-keyboard="open"`
   * drives the compact header/footer classes below through `group/dialog`.
   * Desktop (sm+) never subscribes, so its classes and style are untouched;
   * keyboard closed (or no visualViewport) renders today's sheet exactly.
   */
  const kb = useKeyboardViewport(!isDesktop);
  const keyboard = !isDesktop && kb.keyboardOpen;
  const contentStyle: React.CSSProperties | undefined = keyboard
    ? {
        ...style,
        bottom: kb.bottomInset,
        maxHeight: kb.visibleHeight,
        ...(size === "full" ? { height: kb.visibleHeight } : {}),
      }
    : style;

  // The scroll body, kept for the keyboard re-reveal below. One callback ref
  // (React 19 ref cleanup) both records it and runs trackScrollEdges, which
  // must stay a callback ref (see scroll-edges.ts).
  const bodyRef = React.useRef<HTMLElement | null>(null);
  const setBody = React.useCallback((el: HTMLDivElement | null) => {
    bodyRef.current = el;
    const untrack = trackScrollEdges(el);
    return () => {
      bodyRef.current = null;
      untrack?.();
    };
  }, []);

  // The field focused before the keyboard rose may be covered once the sheet
  // shrinks around it (spec §5): re-reveal it once, when the keyboard opens.
  React.useEffect(() => {
    if (!keyboard) return;
    const scrollBody = bodyRef.current;
    const active = typeof document !== "undefined" ? document.activeElement : null;
    if (scrollBody && active instanceof HTMLElement && active !== scrollBody && scrollBody.contains(active)) {
      revealFocusedField(scrollBody, active);
    }
  }, [keyboard]);

  const body = bare ? (
    children
  ) : (
    <>
      <div
        aria-hidden="true"
        className="mx-auto mt-3.5 h-[5px] w-11 shrink-0 rounded-full bg-border sm:hidden group-data-[keyboard=open]/dialog:hidden"
      />
      {/* `relative` makes this body — not the fixed frame — the containing
          block for absolutely positioned controls inside it (every sr-only
          input: Checkbox, the Attachments and Photo file pickers). Anchored to
          the frame they did not scroll with the body, and focusing one made
          the browser scroll the frame to reveal it: header and body slid up
          and the footer was left mid-dialog over blank background (spec
          2026-10-04 §G, reproduced in-browser at 1920×911 and 390×844).
          trackScrollEdges keeps data-scrolled / data-more-below on it for
          the sticky header and footer edges (group/dialog-body). With the
          phone keyboard open the keyboard covers the home indicator, so the
          bottom padding drops its safe-area part, in step with DialogFooter's
          negative margin. */}
      <div
        ref={setBody}
        data-slot="dialog-body"
        onFocus={(event) => revealFocusedField(event.currentTarget, event.target as HTMLElement)}
        className={cn(
          "group/dialog-body relative flex flex-col gap-3.5 overflow-y-auto scroll-pb-24 px-[18px] pb-[calc(1.375rem+env(safe-area-inset-bottom))] pt-3.5 sm:px-6 sm:pt-6",
          "group-data-[keyboard=open]/dialog:pb-[1.375rem]",
          size === "full" && "min-h-0 flex-1",
        )}
      >
        {children}
      </div>
    </>
  );

  return (
    <DialogPrimitive.Content
      ref={ref}
      data-keyboard={keyboard ? "open" : undefined}
      style={contentStyle}
      className={cn(
        // overflow: clip, where supported, clips the rounded frame without
        // making it a scroll container, so nothing — focus scrolling
        // included — can ever scroll the frame itself (spec 2026-10-04 §G).
        // overflow-hidden stays as the fallback for browsers without clip.
        "fixed z-50 flex flex-col overflow-hidden supports-[overflow:clip]:overflow-clip border-2 border-border bg-background text-foreground",
        "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl border-b-0",
        // The phone bottom sheet's slide stays plain CSS either way.
        "data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down",
        "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-h-[85vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border-b-2 sm:shadow-hard-5",
        // After the base geometry so cn()/tailwind-merge lets `full`'s
        // sm:w / sm:max-h win over sm:w-[calc(100%-2rem)] / sm:max-h-[85vh].
        SIZE_CLASS[size],
        // The desktop (sm+) open pop is a Motion spring (SPRING_POP, below)
        // when motion is allowed. tp-pop-in is kept only as the
        // reduced-motion fallback, so the dialog still appears — instantly,
        // since prefers-reduced-motion collapses --dur-slow to ~0 (see
        // app/globals.css) rather than not animating at all. The close
        // animation (tp-pop-out) is unchanged in both cases: Radix detects
        // the exit via this CSS animation ending, so it stays CSS-driven.
        reduce && "sm:data-[state=open]:tp-pop-in",
        "sm:data-[state=closed]:tp-pop-out",
        // Named group for the phone-keyboard compact state (data-keyboard).
        "group/dialog",
        className,
      )}
      {...props}
    >
      <m.div
        className="flex min-h-0 flex-1 flex-col"
        initial={spring ? { scale: 0.96, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={SPRING_POP}
      >
        {body}
      </m.div>
      {!hideClose ? (
        <DialogPrimitive.Close className="absolute right-4 top-4 z-20 grid size-11 place-items-center rounded-sm border-2 border-border bg-card text-foreground sm:right-5 sm:top-5">
          <X className="size-5" strokeWidth={2.5} aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  );
});
DialogSheet.displayName = "DialogSheet";

const DialogContent = React.forwardRef<React.ComponentRef<typeof DialogPrimitive.Content>, DialogContentProps>((props, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogSheet ref={ref} {...props} />
  </DialogPortal>
));
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
        // pl/pr, not px: an `sm:px-6` would re-set the right padding from 640px and
        // put the title back under the Close (LA-131). pr-18 = the 44px Close + its
        // 20px sm inset + 8px of air, so it holds at both tiers.
        "sticky top-0 z-10 shrink-0 -mx-[18px] mb-1 flex min-h-[72px] flex-col justify-center gap-1 bg-background pl-[18px] pr-18 text-left sm:-mx-6 sm:pl-6",
        "before:content-[''] before:absolute before:inset-x-0 before:bottom-full before:h-3.5 before:bg-background sm:before:h-6",
        // Scroll-aware edge (spec 2026-10-04 §G): once the body is scrolled,
        // a 2px rule in the border colour and a soft downward shadow show
        // content is passing beneath. Shadows, not a border, so the header
        // never changes height; all non-inset, so the fade interpolates.
        "transition-shadow duration-[var(--dur-base)] motion-reduce:transition-none",
        "group-data-[scrolled]/dialog-body:shadow-[0_2px_0_var(--color-border),0_10px_16px_-10px_hsl(var(--shadow-ink)/0.3)]",
        // Phone keyboard open (spec 2026-10-11-phone-keyboard-sheets): one
        // slim 48px row — title and close button only (DialogDescription
        // hides itself) — to give the visible area back to the form.
        "group-data-[keyboard=open]/dialog:min-h-12",
        className,
      )}
      {...props}
    />
  );
}
DialogHeader.displayName = "DialogHeader";

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // The first shadow covers the gap the negative bottom margin opens below
  // the sticky footer during elastic/rubber-band overscroll on iOS Safari (it
  // also covers the strip under the stuck footer in grid forms, where the
  // negative margin doesn't shrink the grid). It was an `after:` box, but an
  // absolutely positioned pseudo hanging past the content adds scrollable
  // overflow: every short dialog scrolled a phantom 22px. A shadow never
  // does. The scroll-aware edge (spec 2026-10-04 §G) appends a 2px rule in
  // the border colour and a soft upward shadow while content is hidden
  // beneath; scrolled to the end, both fade out.
  //
  // Phone keyboard open (spec 2026-10-11-phone-keyboard-sheets): the keyboard
  // covers the home indicator, so the safe-area inset is dropped from all
  // three — the negative margin (matching the scroll body's keyboard-open
  // pb-[1.375rem]), the gap-covering shadow, and the footer's own padding,
  // which tightens to pb-3 (matching pt-3) to keep the docked row compact.
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "sticky bottom-0 z-10 -mx-[18px] -mb-[calc(1.375rem+env(safe-area-inset-bottom))] mt-2 bg-background px-[18px] pb-[calc(1.375rem+env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:px-6",
        "shadow-[0_calc(1.375rem+env(safe-area-inset-bottom))_0_var(--color-background)]",
        "transition-shadow duration-[var(--dur-base)] motion-reduce:transition-none",
        "group-data-[more-below]/dialog-body:shadow-[0_calc(1.375rem+env(safe-area-inset-bottom))_0_var(--color-background),0_-2px_0_var(--color-border),0_-10px_16px_-10px_hsl(var(--shadow-ink)/0.3)]",
        "group-data-[keyboard=open]/dialog:-mb-[1.375rem] group-data-[keyboard=open]/dialog:pb-3",
        "group-data-[keyboard=open]/dialog:shadow-[0_1.375rem_0_var(--color-background)]",
        "group-data-[keyboard=open]/dialog:group-data-[more-below]/dialog-body:shadow-[0_1.375rem_0_var(--color-background),0_-2px_0_var(--color-border),0_-10px_16px_-10px_hsl(var(--shadow-ink)/0.3)]",
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
  <DialogPrimitive.Description
    ref={ref}
    // Hidden in the phone keyboard's compact header (spec 2026-10-11-phone-keyboard-sheets).
    className={cn("text-[13px] font-medium text-muted-foreground max-sm:group-data-[keyboard=open]/dialog:hidden", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
