"use client";

import { useEffect, useRef, useState, type AnimationEvent, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * MOTION.md S1 — the Share page's one entrance wrapper: `tp-rise-in` when the
 * section scrolls into view, once, `index` × 60ms into its row. Renders the
 * same hidden state on the server and the first client render; the reveal
 * happens after hydration. `rise={false}` keeps the section visible and only
 * flags the moment (the CTA's one-time pop, S10).
 */
export function ShareReveal({
  children,
  className,
  index,
  rise = true,
}: {
  children: ReactNode;
  className?: string;
  index?: number;
  rise?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Dropped once the rise-in ends: a section behind `hidden lg:block` would
  // otherwise replay it every time a resize shows it again.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The flag goes straight onto the DOM: it's a one-way switch for CSS,
    // and nothing React renders depends on it.
    const reveal = () => el.setAttribute("data-revealed", "");
    // JS has taken over: stand down globals.css's 3s no-JS failsafe, which
    // would otherwise unhide an off-screen section before it rises in.
    el.setAttribute("data-reveal-armed", "");
    if (typeof IntersectionObserver === "undefined") {
      reveal();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        reveal();
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) setSettled(true);
  };

  return (
    <div
      ref={ref}
      data-slot="share-reveal"
      className={cn(rise && !settled && "tp-reveal", className)}
      style={{ "--tp-i": String(index ?? 0) } as CSSProperties}
      onAnimationEnd={rise ? onAnimationEnd : undefined}
    >
      {children}
    </div>
  );
}

/**
 * A div that plays a CSS entrance (`play`) once and then drops it, so an
 * element behind a responsive `hidden` doesn't replay it on every resize.
 */
export function PlayOnce({ play, className, ...props }: HTMLAttributes<HTMLDivElement> & { play: string }) {
  const [done, setDone] = useState(false);
  return (
    <div
      {...props}
      className={cn(className, !done && play)}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setDone(true);
      }}
    />
  );
}
