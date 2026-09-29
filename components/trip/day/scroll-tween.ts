import { DAY_GLIDE_MS, easeOut } from "@/components/trip/day/carousel-maths";

export interface TweenOptions {
  reduced: boolean;
  durationMs?: number;
  onDone?: () => void;
  raf?: (cb: (t: number) => void) => number;
  now?: () => number;
}

/**
 * Glides `el.scrollLeft` to `to` on the day curve; instant under reduced
 * motion. Drives scrollLeft directly rather than scrollTo({behavior:
 * "smooth"}) so the duration and curve match the body and the strip, and so
 * jsdom can run it. Returns a cancel.
 */
export function tweenScrollLeft(el: { scrollLeft: number }, to: number, opts: TweenOptions): () => void {
  const raf = opts.raf ?? ((cb) => requestAnimationFrame(cb));
  const now = opts.now ?? (() => performance.now());
  const duration = opts.durationMs ?? DAY_GLIDE_MS;
  const from = el.scrollLeft;
  if (opts.reduced || duration <= 0 || from === to) {
    el.scrollLeft = to;
    opts.onDone?.();
    return () => {};
  }
  let cancelled = false;
  const start = now();
  const step = () => {
    if (cancelled) return;
    const t = Math.min(1, (now() - start) / duration);
    el.scrollLeft = from + (to - from) * easeOut(t);
    if (t < 1) raf(step);
    else opts.onDone?.();
  };
  raf(step);
  return () => {
    cancelled = true;
  };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
