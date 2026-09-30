"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMoneyWhole } from "@/lib/money/format-parts";
import { paidPct } from "@/lib/money/summary-lines";

/**
 * The Cost tile's paid bar (MONEY.md §3). `tripId` is unused until Task 15's
 * motion pass wires up the count-up/fill animation — kept in props now so
 * that task only adds behaviour, not a signature change.
 */
export function PaidBar({
  paidMinor,
  totalMinor,
  currency,
  className,
}: {
  paidMinor: number;
  totalMinor: number;
  currency: string;
  tripId: string;
  className?: string;
}) {
  const pct = paidPct(paidMinor, totalMinor);
  const toGo = Math.max(0, totalMinor - paidMinor);
  const allPaid = totalMinor > 0 && paidMinor >= totalMinor;

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
        <div
          data-slot="paid-fill"
          className="h-full w-full origin-left bg-on-accent"
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
      <div className="flex justify-between gap-3 text-sm font-bold tabular-nums">
        <span>
          {formatMoneyWhole(paidMinor, currency)} paid
          <span className="hidden md:inline"> · {pct}%</span>
        </span>
        {allPaid ? (
          <span className="inline-flex items-center gap-1">
            All paid <Check className="size-4" aria-hidden="true" />
          </span>
        ) : (
          <span>{formatMoneyWhole(toGo, currency)} to go</span>
        )}
      </div>
    </div>
  );
}
