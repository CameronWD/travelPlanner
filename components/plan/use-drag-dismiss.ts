"use client";

import * as React from "react";

/**
 * Whether a downward drag on a bottom sheet's handle should close it
 * (MOTION.md P12): past `threshold` of the sheet's height, or a flick faster
 * than `flick` px/ms. An upward drag never closes.
 */
export function shouldDismiss(dy: number, height: number, velocityPxPerMs: number, threshold = 0.3, flick = 0.5): boolean {
  return dy > 0 && (dy > height * threshold || velocityPxPerMs > flick);
}

const SETTLE = "transform var(--dur-base) var(--ease-pop)";

function reset(el: HTMLElement) {
  el.style.transform = "";
  el.style.transition = "";
}

/**
 * Drag-to-dismiss on a bottom sheet's handle (MOTION.md P12). Spread
 * `handleProps` on a handle inside the sheet (`role="dialog"`). The sheet
 * follows the finger down, then either closes (`onDismiss`) or springs back
 * over --dur-base; under reduced motion the global rule makes that instant.
 *
 * The drag writes the sheet's `style.transform` directly, never React state,
 * so a pointermove re-renders nothing. On a dismiss the sheet is left where
 * it was let go, so its CSS slide-down carries on from there; the inline
 * transform is cleared when that animation ends, or at once if the sheet
 * didn't start closing (the caller kept it open).
 */
export function useDragDismiss({
  onDismiss,
  threshold = 0.3,
  flickVelocity = 0.5,
}: {
  onDismiss(): void;
  threshold?: number;
  flickVelocity?: number;
}): { handleProps: React.HTMLAttributes<HTMLElement> } {
  const drag = React.useRef<{ el: HTMLElement; y0: number; t0: number; height: number; dy: number } | null>(null);

  const handleProps: React.HTMLAttributes<HTMLElement> = {
    onPointerDown(e) {
      const el = (e.currentTarget.closest('[role="dialog"]') as HTMLElement | null) ?? e.currentTarget.parentElement;
      if (!el) return;
      drag.current = { el, y0: e.clientY, t0: performance.now(), height: el.getBoundingClientRect().height, dy: 0 };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      el.style.transition = "none";
    },
    onPointerMove(e) {
      const d = drag.current;
      if (!d) return;
      d.dy = Math.max(0, e.clientY - d.y0);
      d.el.style.transform = `translateY(${d.dy}px)`;
    },
    onPointerUp(e) {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      const dy = Math.max(0, e.clientY - d.y0);
      const elapsed = Math.max(1, performance.now() - d.t0);
      if (shouldDismiss(dy, d.height, dy / elapsed, threshold, flickVelocity)) {
        d.el.style.transition = "";
        // The sheet's own slide-out only: a descendant's animationend bubbles here too.
        const onEnd = (ev: AnimationEvent) => {
          if (ev.target !== d.el) return;
          d.el.removeEventListener("animationend", onEnd);
          reset(d.el);
        };
        d.el.addEventListener("animationend", onEnd);
        onDismiss();
        // A sheet the caller kept open never animates out: put it back.
        window.setTimeout(() => {
          if (d.el.getAttribute("data-state") !== "closed") reset(d.el);
        }, 0);
      } else {
        d.el.style.transition = SETTLE;
        d.el.style.transform = "";
      }
    },
    onPointerCancel() {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      d.el.style.transition = SETTLE;
      d.el.style.transform = "";
    },
  };

  return { handleProps };
}
