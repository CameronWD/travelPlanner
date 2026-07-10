import { formatMoney } from "@/lib/money";

/**
 * Estimated (and, when spent, actual) amounts rendered with locked alignment,
 * color, and accessible labels. Shared across the budget page sections so the
 * "estimated vs spent" reading is identical everywhere.
 */
export function CostAmounts({
  estimatedMinor,
  actualMinor,
  currency,
  className,
}: {
  estimatedMinor: number;
  actualMinor: number;
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
        {formatMoney(estimatedMinor, currency)}
      </span>
      <span
        aria-label="Spent"
        className={
          "text-right whitespace-nowrap" +
          (actualMinor > 0
            ? " text-emerald-600 dark:text-emerald-400"
            : " text-muted-foreground")
        }
      >
        {actualMinor > 0 ? formatMoney(actualMinor, currency) : "—"}
      </span>
    </div>
  );
}
