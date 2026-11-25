import { cn } from "@/lib/cn";
import { refundTagText, type RefundTagCost } from "@/lib/money/refund-tag-text";

export function RefundTag({
  cost,
  format,
  className,
}: {
  cost: RefundTagCost;
  format?: (minor: number, currency: string) => string;
  className?: string;
}) {
  const text = refundTagText(cost, format);
  if (!text) return null;
  return (
    <span data-refund-tag className={cn("text-xs font-semibold", cost.refundedAt != null ? "text-teal-text" : "text-muted-foreground", className)}>
      {text}
    </span>
  );
}
