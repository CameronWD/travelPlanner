import { formatMoney } from "@/lib/money";

/**
 * Cost (and, when paid, the paid amount) rendered with locked alignment,
 * color, and accessible labels. Shared across the budget page sections so the
 * "cost vs paid" reading is identical everywhere.
 */
export function CostAmounts({
  costTotalMinor,
  paidTotalMinor,
  currency,
  className,
}: {
  costTotalMinor: number;
  paidTotalMinor: number;
  currency: string;
  className?: string;
}) {
  return (
    <div
      className={
        "flex shrink-0 items-center gap-2 sm:gap-4 tabular-nums text-sm" +
        (className ? ` ${className}` : "")
      }
    >
      <span aria-label="Cost" className="text-right whitespace-nowrap">
        {formatMoney(costTotalMinor, currency)}
      </span>
      <span
        aria-label="Paid"
        className={
          "text-right whitespace-nowrap" +
          (paidTotalMinor > 0
            ? " text-emerald-600 dark:text-emerald-400"
            : " text-muted-foreground")
        }
      >
        {paidTotalMinor > 0 ? formatMoney(paidTotalMinor, currency) : "—"}
      </span>
    </div>
  );
}
