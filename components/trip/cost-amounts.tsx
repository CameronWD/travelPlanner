import { formatMoney } from "@/lib/money";

/**
 * Estimated (and, when spent, actual) amounts rendered with locked alignment,
 * color, and accessible labels. Shared across the budget page sections so the
 * "estimated vs spent" reading is identical everywhere.
 */
export function CostAmounts({
  costMinor,
  paidMinor,
  currency,
  className,
}: {
  costMinor: number;
  paidMinor: number;
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
      <span aria-label="Estimated" className="text-right whitespace-nowrap">
        {formatMoney(costMinor, currency)}
      </span>
      <span
        aria-label="Spent"
        className={
          "text-right whitespace-nowrap" +
          (paidMinor > 0
            ? " text-emerald-600 dark:text-emerald-400"
            : " text-muted-foreground")
        }
      >
        {paidMinor > 0 ? formatMoney(paidMinor, currency) : "—"}
      </span>
    </div>
  );
}
