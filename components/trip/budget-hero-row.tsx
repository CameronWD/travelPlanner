import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

interface BudgetHeroRowProps {
  /** Trip-wide cost total in home currency minor units. */
  costTotalMinor: number;
  /** Trip-wide total paid so far, in home currency minor units. */
  paidTotalMinor: number;
  /** Home currency ISO 4217 code. */
  homeCurrency: string;
  /**
   * Number of nights in the trip (used for cost/day).
   * When 0 or undefined the COST / DAY tile shows "—".
   */
  tripNights?: number;
  /**
   * Whether to show the Paid / Still-to-pay tiles and the paid-progress bar.
   * Defaults to true. Set to false when `paidTotalMinor` isn't a trustworthy
   * trip-wide figure for this render (e.g. on a plan variant/fork, where paid
   * tracking lives on the real plan only) — the Cost total and Cost/day
   * tiles still render.
   */
  showPaid?: boolean;
}

/**
 * 4-up hero row for the Budget page (Desktop D5 mock).
 * Grid: 2-col on mobile → 4-col on sm+.
 * Tiles: COST TOTAL · PAID · STILL TO PAY · COST / DAY
 * When `showPaid` is false, only COST TOTAL and COST / DAY render.
 */
export function BudgetHeroRow({
  costTotalMinor,
  paidTotalMinor,
  homeCurrency,
  tripNights,
  showPaid = true,
}: BudgetHeroRowProps) {
  const stillToPayMinor = costTotalMinor - paidTotalMinor;

  // Progress bar: paid / cost (capped at 100%)
  const paidPct =
    costTotalMinor > 0
      ? Math.min(100, Math.round((paidTotalMinor / costTotalMinor) * 100))
      : 0;

  // Per-day: guard against zero/missing nights
  const hasNights = typeof tripNights === "number" && tripNights > 0;
  const estPerDayMinor = hasNights ? Math.round(costTotalMinor / tripNights!) : null;

  return (
    <div
      className={cn(
        "grid gap-3",
        showPaid ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-2",
      )}
    >
      {/* Tile 1: COST TOTAL */}
      <div
        className={cn(
          "rounded-2xl border border-border bg-card p-4 flex flex-col gap-3",
          showPaid && "col-span-2 sm:col-span-2",
        )}
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Cost total
        </p>
        <p className="font-display text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight break-words">
          {formatMoney(costTotalMinor, homeCurrency)}
        </p>
        {/* Paid/cost progress bar — only meaningful when paid tracking applies */}
        {showPaid && (
          <div className="flex flex-col gap-1">
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-success transition-all"
                style={{ width: `${paidPct}%` }}
                aria-label={`${paidPct}% paid`}
              />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatMoney(paidTotalMinor, homeCurrency)} paid so far
            </p>
          </div>
        )}
      </div>

      {showPaid && (
        <>
          {/* Tile 2: PAID */}
          <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              Paid
            </p>
            <p className="font-display text-2xl font-semibold tabular-nums tracking-tight break-words">
              {formatMoney(paidTotalMinor, homeCurrency)}
            </p>
          </div>

          {/* Tile 3: STILL TO PAY */}
          <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              Still to pay
            </p>
            <p className="font-display text-2xl font-semibold tabular-nums tracking-tight break-words">
              {formatMoney(Math.max(0, stillToPayMinor), homeCurrency)}
            </p>
          </div>
        </>
      )}

      {/* Tile 4: COST / DAY */}
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Cost / day
        </p>
        <p
          data-testid="est-per-day-value"
          className="font-display text-2xl font-semibold tabular-nums tracking-tight break-words"
        >
          {estPerDayMinor !== null ? formatMoney(estPerDayMinor, homeCurrency) : "—"}
        </p>
      </div>
    </div>
  );
}
