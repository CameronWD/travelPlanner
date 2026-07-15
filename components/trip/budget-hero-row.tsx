import { formatMoney } from "@/lib/money";

interface BudgetHeroRowProps {
  /** Estimated grand total in home currency minor units. */
  estimatedMinor: number;
  /** Total paid so far (actual amounts for paid costs) in home currency minor units. */
  paidMinor: number;
  /** Home currency ISO 4217 code. */
  homeCurrency: string;
  /**
   * Number of nights in the trip (used for est/day).
   * When 0 or undefined the EST / DAY tile shows "—".
   */
  tripNights?: number;
}

/**
 * 4-up hero row for the Budget page (Desktop D5 mock).
 * Grid: 2-col on mobile → 4-col on sm+.
 * Tiles: ESTIMATED TOTAL · PAID · STILL TO PAY · EST / DAY
 */
export function BudgetHeroRow({
  estimatedMinor,
  paidMinor,
  homeCurrency,
  tripNights,
}: BudgetHeroRowProps) {
  const stillToPayMinor = estimatedMinor - paidMinor;

  // Progress bar: paid / estimated (capped at 100%)
  const paidPct =
    estimatedMinor > 0
      ? Math.min(100, Math.round((paidMinor / estimatedMinor) * 100))
      : 0;

  // Per-day: guard against zero/missing nights
  const hasNights = typeof tripNights === "number" && tripNights > 0;
  const estPerDayMinor = hasNights ? Math.round(estimatedMinor / tripNights!) : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* Tile 1: ESTIMATED TOTAL */}
      <div className="col-span-2 sm:col-span-2 rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Estimated total
        </p>
        <p className="font-display text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight break-words">
          {formatMoney(estimatedMinor, homeCurrency)}
        </p>
        {/* Spent/estimated progress bar */}
        <div className="flex flex-col gap-1">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${paidPct}%` }}
              aria-label={`${paidPct}% paid`}
            />
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatMoney(paidMinor, homeCurrency)} spent so far
          </p>
        </div>
      </div>

      {/* Tile 2: PAID */}
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Paid
        </p>
        <p className="font-display text-2xl font-semibold tabular-nums tracking-tight break-words">
          {formatMoney(paidMinor, homeCurrency)}
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

      {/* Tile 4: EST / DAY */}
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Est / day
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
