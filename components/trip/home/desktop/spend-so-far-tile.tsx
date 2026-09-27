import Link from "next/link";
import { formatMoneyAuto } from "@/lib/money";
import { Card } from "@/components/ui/card";

export interface SpendSoFarTileProps {
  /** The Money page. */
  href: string;
  /** The Trip's home currency — every figure is in it. */
  currency: string;
  /** The Travelling Phase's own Spend so far numbers (lib/spend-so-far.ts). */
  paidSoFarMinor: number;
  costTotalMinor: number;
  /** paidSoFar − paidEstimate; > 0 = over the estimates on what's been paid. */
  varianceMinor: number;
  tripElapsedPct: number | null;
}

const EYEBROW = "text-[11px] font-extrabold uppercase tracking-[0.08em]";

/**
 * Desktop Travelling Home "Spend so far" tile (spec D). Sun card, same
 * language as the Planning Shared pot tile: the whole tile links to Money
 * through a stretched link underneath the content. The numbers are the ones
 * the Travelling Phase already computes (buildSpendSoFar) — a shared pot,
 * never split per person. Totals abbreviate from 1,000 ($4.2k); anything
 * unabbreviated shows 2 decimals ($125.50).
 */
export function SpendSoFarTile({
  href,
  currency,
  paidSoFarMinor,
  costTotalMinor,
  varianceMinor,
  tripElapsedPct,
}: SpendSoFarTileProps) {
  const noData = costTotalMinor === 0 && paidSoFarMinor === 0;
  const paid = formatMoneyAuto(paidSoFarMinor, currency);

  return (
    <Card tone="sun" radius="xl" shadow={3} className="relative flex h-full min-h-0 overflow-hidden text-on-accent">
      <Link
        href={href}
        aria-label={`Spend so far: ${paid} paid. Open Money`}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-[3px] focus-visible:-outline-offset-4 focus-visible:outline-ring"
      />
      <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col px-6 py-[22px]">
        <div className="flex items-center justify-between gap-2">
          <h2 className={EYEBROW}>Spend so far</h2>
          <span className="text-xs font-semibold">shared pot</span>
        </div>
        <p className="mt-1.5 font-display text-[40px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">
          {paid}
        </p>
        {noData ? (
          <Link
            href={href}
            className="pointer-events-auto relative z-10 mt-auto inline-flex min-h-11 items-center self-start text-sm font-bold underline underline-offset-2"
          >
            Add your first cost
          </Link>
        ) : (
          <>
            <p className="mt-1 text-sm font-semibold">of {formatMoneyAuto(costTotalMinor, currency)} cost</p>
            <div className="mt-auto flex flex-col gap-0.5 border-t-2 border-border pt-3">
              {varianceMinor !== 0 ? (
                <p className="text-[15px] font-bold">
                  {formatMoneyAuto(Math.abs(varianceMinor), currency)} {varianceMinor > 0 ? "over" : "under"}
                </p>
              ) : null}
              {tripElapsedPct != null ? (
                <p className="text-[13px] text-on-accent-muted">≈{tripElapsedPct}% of the trip elapsed</p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
