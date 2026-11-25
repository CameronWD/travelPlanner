import { cn } from "@/lib/cn";
import { refundLabel } from "@/lib/money/refund-label";

export function RefundTag({
  cost,
  className,
}: {
  cost: { refundMinor?: number | null; refundedAt?: Date | string | null; currency: string };
  className?: string;
}) {
  const label = refundLabel(cost);
  if (!label) return null;
  const received = cost.refundedAt != null;
  return (
    <span data-refund-tag className={cn("text-xs font-semibold", received ? "text-teal-text" : "text-muted-foreground", className)}>
      {label}
    </span>
  );
}
