"use client";

import * as React from "react";
import { motion, useReducedMotion, useTransform } from "motion/react";
import { formatMoney } from "@/lib/money";
import { formatMoneyParts } from "@/lib/money/format-parts";
import { useMoneyEntrance } from "./money-entrance";
import { useTween } from "./use-tween";

/**
 * The Cost tile's total (MOTION.md M2, M9): counts 0→total over 700ms with
 * `--ease-pop` the first time a session sees this trip, then renders static;
 * a later change to `minor` (a cost saved/edited/deleted) re-tweens over
 * 320ms regardless of the session gate. Reduced motion always renders final.
 * Same two-span markup as the static tile so callers don't need to branch.
 * The tween lives in a `MotionValue` (not React state), so counting up
 * doesn't re-render this component every frame — `useTransform` derives the
 * formatted text and `<motion.span>` writes it to the DOM directly.
 */
export function MoneyCountUp({
  minor,
  currency,
}: {
  minor: number;
  currency: string;
  // Kept in the props (rather than reading tripId off context alone) so the
  // call site stays self-describing; scoping itself comes from the
  // enclosing <MoneyEntrance tripId=…> provider, not this prop.
  tripId: string;
}) {
  const entrance = useMoneyEntrance();
  const reduce = useReducedMotion() === true;
  // State, not a ref: reading a ref's `.current` during render is unsafe
  // (react-hooks/refs), and this value drives what gets rendered.
  const [first, setFirst] = React.useState(true);

  const skip = reduce || (entrance !== "play" && first);
  const duration = first ? 0.7 : 0.32;

  const mv = useTween(minor, { from: 0, duration, skip, restartOn: entrance === "play", ease: [0.2, 0.8, 0.2, 1] });
  const whole = useTransform(mv, (v) => formatMoneyParts(Math.round(v), currency).whole);
  const fraction = useTransform(mv, (v) => formatMoneyParts(Math.round(v), currency).fraction ?? "");
  const hasFraction = formatMoneyParts(minor, currency).fraction !== null;

  React.useEffect(() => {
    if (!first) return;
    // Deferred a microtask rather than called synchronously in the effect
    // body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => setFirst(false));
  }, [first]);

  return (
    <>
      <span className="sr-only">{formatMoney(minor, currency)}</span>
      <motion.span aria-hidden="true" className="text-[56px] lg:text-[72px] xl:text-[88px]">
        {whole}
      </motion.span>
      {hasFraction ? (
        <motion.span aria-hidden="true" data-testid="cost-tile-fraction" className="text-[20px] tracking-[-0.02em] lg:text-[28px]">
          {fraction}
        </motion.span>
      ) : null}
    </>
  );
}
