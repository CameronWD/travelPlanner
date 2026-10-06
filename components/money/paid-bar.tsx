"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { m, useReducedMotion, useTransform } from "motion/react";
import { cn } from "@/lib/cn";
import { formatMoneyWhole } from "@/lib/money/format-parts";
import { paidPct } from "@/lib/money/summary-lines";
import { useMoneyEntrance } from "./money-entrance";
import { useTween, useTweenThenSpring } from "./use-tween";

/**
 * The Cost tile's paid bar (MONEY.md §3; motion MOTION.md M3–M4). On the
 * Cost tile's once-per-session "play" mount, the ink fill grows from
 * `scaleX(0)` and the percentage counts up with it (700ms, 120ms delay,
 * `--ease-pop`). After that (a row ticked in To pay, M4), the fill springs
 * to its new value and the paid/to-go amounts tween over 320ms — no
 * confetti, no re-run of the mount animation. The tweened numbers live in
 * `MotionValue`s (not React state), so they don't re-render this component
 * every frame — see use-tween.ts.
 */
export function PaidBar({
  paidMinor,
  totalMinor,
  currency,
  tripId,
  className,
}: {
  paidMinor: number;
  totalMinor: number;
  currency: string;
  tripId: string;
  className?: string;
}) {
  void tripId; // scoping is via the enclosing <MoneyEntrance tripId=…> provider, not this prop
  const phase = useMoneyEntrance();
  const reduce = useReducedMotion() === true;
  // State, not a ref: reading a ref's `.current` during render is unsafe
  // (react-hooks/refs), and this value drives what gets rendered — including
  // which *transition* the fill uses (tween only for the mount's own first
  // fill-in; every later tick, even though `phase` itself stays "play" for
  // the rest of the session, springs instead — M4).
  const [first, setFirst] = React.useState(true);

  const pct = paidPct(paidMinor, totalMinor);
  const toGo = Math.max(0, totalMinor - paidMinor);
  const allPaid = totalMinor > 0 && paidMinor >= totalMinor;

  const fillSkip = reduce || (phase !== "play" && first);
  // Mount-independent (MOTION.md M3–M4): a motion.div's initial/animate/
  // transition props only apply an entrance transition at the component's
  // literal mount, which is never the moment `phase` becomes "play" —
  // MoneyEntrance deliberately stays "pending" through hydration (see
  // money-entrance.tsx), so `initial` would already be locked in as `false`
  // by the time `phase` resolves. Driving scaleX from a MotionValue instead
  // sidesteps that: it's set/animated imperatively, independent of mount
  // timing. Reviewer-reproduced regression: SSR + hydrateRoot left the fill
  // sitting at its final scaleX from render straight through the fill-in
  // window, with only the "N%" label actually counting up beside it.
  const fillMv = useTweenThenSpring(pct / 100, {
    skip: fillSkip,
    restartOn: phase === "play",
    duration: 0.7,
    delay: 0.12,
    ease: [0.2, 0.8, 0.2, 1],
    springStiffness: 300,
    springDamping: 30,
  });
  const pctMv = useTween(pct, {
    from: 0,
    duration: first ? 0.7 : 0.32,
    delay: first ? 0.12 : undefined,
    // Matches the fill's own tween exactly on the mount's first fill-in
    // (MOTION.md M3: "the label counts up with it") — without this the
    // label used motion's default ease instead of --ease-pop and visibly
    // fell out of step with the fill (caught by a mid-entrance sample test).
    ease: first ? [0.2, 0.8, 0.2, 1] : undefined,
    skip: fillSkip,
    restartOn: phase === "play",
  });
  const paidMv = useTween(paidMinor, { duration: 0.32, skip: reduce || first });
  const toGoMv = useTween(toGo, { duration: 0.32, skip: reduce || first });

  // Each combines its own leading/trailing static text into the transform's
  // output (rather than nesting a motion.span for just the number inside a
  // plain span) so the whole line renders as ONE element's own text — the
  // "$X to go"/"$X paid"/"· N%" strings testing-library's getByText matches
  // against are read from an element's *direct* text-node children only,
  // not descended into nested elements (dom-testing-library's getNodeText).
  const paidText = useTransform(paidMv, (v) => `${formatMoneyWhole(Math.round(v), currency)} paid`);
  const pctText = useTransform(pctMv, (v) => ` · ${Math.round(v)}%`);
  const toGoText = useTransform(toGoMv, (v) => `${formatMoneyWhole(Math.round(v), currency)} to go`);

  React.useEffect(() => {
    if (!first) return;
    // Deferred a microtask rather than called synchronously in the effect
    // body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => setFirst(false));
  }, [first]);

  return (
    <div data-slot="paid-bar" className={cn("flex flex-col gap-2", className)}>
      <div
        role="progressbar"
        aria-label="Paid so far"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-[22px] overflow-hidden rounded-full border-2 border-border bg-unpaid-stripe md:h-[30px]"
      >
        <m.div data-slot="paid-fill" className="h-full w-full origin-left bg-on-accent" style={{ scaleX: fillMv }} />
      </div>
      <div className="flex justify-between gap-3 text-sm font-bold tabular-nums">
        <span>
          <m.span>{paidText}</m.span>
          <m.span className="hidden md:inline">{pctText}</m.span>
        </span>
        {allPaid ? (
          <span className="inline-flex items-center gap-1">
            All paid <Check className="size-4" aria-hidden="true" />
          </span>
        ) : (
          <m.span>{toGoText}</m.span>
        )}
      </div>
    </div>
  );
}
