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

type Phase = "idle" | "dragging" | "settling" | "dismissed";

/**
 * Drag-to-dismiss on a bottom sheet's handle (MOTION.md P12). Spread
 * `handleProps` on the handle and `style` on the sheet: the sheet follows the
 * finger down, then either closes (`onDismiss`) or springs back over
 * --dur-base. A dismissed sheet stays where it was let go, so its CSS
 * slide-down continues from there. Under reduced motion the global rule
 * collapses the spring-back to an instant reset.
 */
export function useDragDismiss({
  onDismiss,
  threshold = 0.3,
  flickVelocity = 0.5,
}: {
  onDismiss(): void;
  threshold?: number;
  flickVelocity?: number;
}): { handleProps: React.HTMLAttributes<HTMLElement>; style: React.CSSProperties } {
  const start = React.useRef<{ y0: number; t0: number; height: number } | null>(null);
  const [drag, setDrag] = React.useState<{ dy: number; phase: Phase }>({ dy: 0, phase: "idle" });

  const handleProps: React.HTMLAttributes<HTMLElement> = {
    onPointerDown(e) {
      const sheet = e.currentTarget.closest('[role="dialog"]') ?? e.currentTarget.parentElement;
      start.current = { y0: e.clientY, t0: performance.now(), height: sheet?.getBoundingClientRect().height ?? 0 };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDrag({ dy: 0, phase: "dragging" });
    },
    onPointerMove(e) {
      if (!start.current) return;
      setDrag({ dy: Math.max(0, e.clientY - start.current.y0), phase: "dragging" });
    },
    onPointerUp(e) {
      const s = start.current;
      if (!s) return;
      start.current = null;
      const dy = Math.max(0, e.clientY - s.y0);
      const elapsed = Math.max(1, performance.now() - s.t0);
      if (shouldDismiss(dy, s.height, dy / elapsed, threshold, flickVelocity)) {
        setDrag({ dy, phase: "dismissed" });
        onDismiss();
      } else {
        setDrag({ dy: 0, phase: "settling" });
      }
    },
    onPointerCancel() {
      if (!start.current) return;
      start.current = null;
      setDrag({ dy: 0, phase: "settling" });
    },
  };

  const style: React.CSSProperties =
    drag.phase === "dragging"
      ? { transform: `translateY(${drag.dy}px)`, transition: "none" }
      : drag.phase === "dismissed"
        ? { transform: `translateY(${drag.dy}px)` }
        : drag.phase === "settling"
          ? { transition: "transform var(--dur-base) var(--ease-pop)" }
          : {};

  return { handleProps, style };
}
