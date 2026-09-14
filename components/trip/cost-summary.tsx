import * as React from "react";
import { DollarSign, CheckCircle2 } from "lucide-react";
import { formatMoney, convertMinor } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { CostRow } from "@/server/actions/costs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostSummaryProps {
  cost: CostRow;
  /** Trip's home currency — shown as converted equivalent when rateToHome exists. */
  homeCurrency?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Compact one-line display of a single Cost row.
 *
 * Shows exactly one current number: the cost amount while unpaid, or the
 * paid amount (emerald, with a checkmark and "paid") once `paidAt` is set.
 * The paid gate is `Boolean(cost.paidAt)` — a stale `paidMinor` on an
 * un-marked cost must never surface. The `≈ home` equivalent is always
 * computed from whichever amount is shown.
 */
export function CostSummary({ cost, homeCurrency, className }: CostSummaryProps) {
  const isPaid = Boolean(cost.paidAt);
  const shownMinor =
    isPaid && cost.paidMinor !== null && cost.paidMinor !== undefined
      ? cost.paidMinor
      : cost.costMinor;
  const shownStr = formatMoney(shownMinor, cost.currency);

  // Home-currency equivalent, computed from the shown amount.
  const rate = cost.rateToHome;
  const homeEquivStr =
    homeCurrency != null &&
    rate != null &&
    cost.currency.toUpperCase() !== homeCurrency.toUpperCase()
      ? formatMoney(
          convertMinor(shownMinor, cost.currency, homeCurrency, rate),
          homeCurrency,
        )
      : null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <DollarSign className="size-3 shrink-0 text-primary/70" aria-hidden="true" />

      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
        <span
          className={cn(
            "flex items-center gap-0.5",
            isPaid ? "text-emerald-600 dark:text-emerald-400" : "font-medium text-foreground",
          )}
        >
          {isPaid && (
            <CheckCircle2
              className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-label="Paid"
            />
          )}
          {shownStr}
          {isPaid && <span>paid</span>}
        </span>
        {homeEquivStr && (
          <span className="text-muted-foreground/70">
            ≈&nbsp;{homeEquivStr}
          </span>
        )}
      </div>
    </div>
  );
}
