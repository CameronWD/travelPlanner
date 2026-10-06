"use client";

import { LazyMotion, domMax } from "motion/react";

/**
 * Loads Motion's layout-animation features (`layout`, `layoutId`) for the
 * `m.*` element it wraps (spec 2026-10-06 §Q). Renders no DOM of its own.
 */
export function LayoutMotion({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={domMax}>{children}</LazyMotion>;
}
