"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { motion, useReducedMotion, useTransform } from "motion/react";
import { cn } from "@/lib/cn";
import { formatMoneyWhole } from "@/lib/money/format-parts";
import { paidPct } from "@/lib/money/summary-lines";
import { useMoneyEntrance } from "./money-entrance";
import { useTween } from "./use-tween";

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
  const pctMv = useTween(pct, { from: 0, duration: first ? 0.7 : 0.32, delay: first ? 0.12 : undefined, skip: fillSkip });
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
        <motion.div
          data-slot="paid-fill"
          className="h-full w-full origin-left bg-on-accent"
          // A "play" mount's fill genuinely starts at 0 and animates in;
          // every other case (server/pending, static, reduced motion) just
          // renders at the target with no entrance transition. `phase` is
          // "pending" for both the server render and the client's first
          // (hydrating) render — see money-entrance.tsx — so this matches on
          // both sides and never causes a hydration mismatch.
          initial={phase === "play" ? { scaleX: 0 } : false}
          animate={{ scaleX: pct / 100 }}
          transition={first ? { duration: 0.7, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] } : { type: "spring", stiffness: 300, damping: 30 }}
        />
      </div>
      <div className="flex justify-between gap-3 text-sm font-bold tabular-nums">
        <span>
          <motion.span>{paidText}</motion.span>
          <motion.span className="hidden md:inline">{pctText}</motion.span>
        </span>
        {allPaid ? (
          <span className="inline-flex items-center gap-1">
            All paid <Check className="size-4" aria-hidden="true" />
          </span>
        ) : (
          <motion.span>{toGoText}</motion.span>
        )}
      </div>
    </div>
  );
}
