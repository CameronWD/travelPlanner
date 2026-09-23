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
  /**
   * Minor units paid, or `null` when nothing has been paid. Zero is a real
   * paid amount — a comped night, an award fare — and must read as money, not
   * as the placeholder (CP-17).
   */
  paidTotalMinor: number | null;
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
          (paidTotalMinor !== null
            ? " text-teal-text"
            : " text-muted-foreground")
        }
      >
        {paidTotalMinor !== null ? formatMoney(paidTotalMinor, currency) : "—"}
      </span>
    </div>
  );
}
