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
        "flex shrink-0 items-center gap-4 tabular-nums text-sm text-right" +
        (className ? ` ${className}` : "")
      }
    >
      <span aria-label="Estimated" className="min-w-[5rem] text-right">
        {formatMoney(estimatedMinor, currency)}
      </span>
      {actualMinor > 0 && (
        <span
          aria-label="Spent"
          className="min-w-[5rem] text-right text-emerald-600 dark:text-emerald-400"
        >
          {formatMoney(actualMinor, currency)}
        </span>
      )}
    </div>
  );
}
