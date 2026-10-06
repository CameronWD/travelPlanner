"use client";

import * as React from "react";
import { m, useReducedMotion, useTransform } from "motion/react";
import { useTween } from "@/components/money/use-tween";

const EASE_POP: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/**
 * A number that counts from its old value to its new one (MOTION.md P7, P10)
 * on a motion value, so no React state changes per frame. It starts at its
 * real value, so the server render and the first client render agree, and
 * only a later change tweens. Reduced motion jumps straight to the value.
 */
export function TweenNumber({
  value,
  format,
  durationSec,
  className,
}: {
  value: number;
  format: (n: number) => string;
  durationSec: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const mv = useTween(value, { duration: durationSec, ease: EASE_POP, skip: Boolean(reduced) });
  const text = useTransform(mv, format);
  return <m.span className={className}>{text}</m.span>;
}
