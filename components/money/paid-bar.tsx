"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
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
 * confetti, no re-run of the mount animation.
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
  const reduce = useReducedMotion();
  // State, not a ref: reading a ref's `.current` during render is unsafe
  // (react-hooks/refs), and these values drive what gets rendered.
  const [first, setFirst] = React.useState(true);
  const [mounted, setMounted] = React.useState(false);

  const pct = paidPct(paidMinor, totalMinor);
  const toGo = Math.max(0, totalMinor - paidMinor);
  const allPaid = totalMinor > 0 && paidMinor >= totalMinor;

  const fillSkip = reduce || (phase !== "play" && first);
  const shownPct = Math.round(useTween(pct, { from: 0, duration: 0.7, delay: 0.12, skip: fillSkip }));
  const shownPaid = useTween(paidMinor, { duration: 0.32, skip: reduce || first });
  const shownToGo = useTween(toGo, { duration: 0.32, skip: reduce || first });

  React.useEffect(() => {
    if (!first && mounted) return;
    // Deferred a microtask rather than called synchronously in the effect
    // body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => {
      setMounted(true);
      setFirst(false);
    });
  }, [first, mounted]);

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
          initial={false}
          animate={{ scaleX: pct / 100 }}
          transition={
            phase === "play" ? { duration: 0.7, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] } : { type: "spring", stiffness: 300, damping: 30 }
          }
          // `phase` resolves client-side during the same render as the SSR
          // markup (money-entrance.tsx), so a "play" mount's starting scaleX
          // can legitimately differ from the server's — same reasoning as
          // MoneyCountUp's suppressHydrationWarning spans.
          suppressHydrationWarning
          style={{ scaleX: phase === "play" && !mounted ? 0 : pct / 100 }}
        />
      </div>
      <div className="flex justify-between gap-3 text-sm font-bold tabular-nums">
        <span>
          {formatMoneyWhole(Math.round(shownPaid), currency)} paid
          <span className="hidden md:inline"> · {shownPct}%</span>
        </span>
        {allPaid ? (
          <span className="inline-flex items-center gap-1">
            All paid <Check className="size-4" aria-hidden="true" />
          </span>
        ) : (
          <span>{formatMoneyWhole(Math.round(shownToGo), currency)} to go</span>
        )}
      </div>
    </div>
  );
}
