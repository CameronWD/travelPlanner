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
 * Shows:
 *  - estimated amount (always)
 *  - actual amount (if present, with a paid checkmark)
 *  - home-currency equivalent in parentheses (if rateToHome is known and
 *    currency !== homeCurrency)
 *  - a "paid" badge when paidAt is set
 */
export function CostSummary({ cost, homeCurrency, className }: CostSummaryProps) {
  const estimatedStr = formatMoney(cost.estimatedMinor, cost.currency);
  const actualStr = cost.actualMinor !== null && cost.actualMinor !== undefined
    ? formatMoney(cost.actualMinor, cost.currency)
    : null;

  // Home-currency equivalent
  const rate = cost.rateToHome;
  const homeEquiv =
    homeCurrency != null &&
    rate != null &&
    cost.currency.toUpperCase() !== homeCurrency.toUpperCase()
      ? {
          estimated: formatMoney(
            convertMinor(cost.estimatedMinor, cost.currency, homeCurrency, rate),
            homeCurrency,
          ),
          actual:
            cost.actualMinor !== null && cost.actualMinor !== undefined
              ? formatMoney(
                  convertMinor(cost.actualMinor, cost.currency, homeCurrency, rate),
                  homeCurrency,
                )
              : null,
        }
      : null;

  const isPaid = Boolean(cost.paidAt);

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <DollarSign className="size-3 shrink-0 text-primary/70" aria-hidden="true" />

      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
        {/* Estimated */}
        <span className="font-medium text-foreground">
          {estimatedStr}
        </span>
        {homeEquiv?.estimated && (
          <span className="text-muted-foreground/70">
            ≈&nbsp;{homeEquiv.estimated}
          </span>
        )}

        {/* Actual (if present) */}
        {actualStr && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span
              className={cn(
                "flex items-center gap-0.5",
                isPaid ? "text-emerald-600 dark:text-emerald-400" : "text-foreground/80",
              )}
            >
              {isPaid && (
                <CheckCircle2 className="size-3 shrink-0" aria-hidden="true" />
              )}
              {actualStr}
              {homeEquiv?.actual && (
                <span className="text-muted-foreground/70 ml-0.5">
                  ≈&nbsp;{homeEquiv.actual}
                </span>
              )}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
