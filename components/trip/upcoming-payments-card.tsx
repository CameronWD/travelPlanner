import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { ROW_FIGURE_CLASS, ROW_NAME_CLASS } from "@/components/ui/row-text";
import { formatMoney } from "@/lib/money/money";
import { tripPath } from "@/lib/trip-path";
import { paymentAmountParts, type UpcomingPayment } from "@/lib/money/upcoming-payments";

interface UpcomingPaymentsCardProps {
  payments: UpcomingPayment[];
  tripId: string;
  /** The Trip's current slug (or id fallback), for building links (ADR 0064). */
  tripSlug: string;
}

function timingPhrase(daysUntil: number): string {
  if (daysUntil === 0) return "comes out today";
  if (daysUntil === 1) return "comes out tomorrow";
  if (daysUntil > 1) return `comes out in ${daysUntil} days`;
  return `was due ${-daysUntil} day(s) ago`;
}

/**
 * The "Upcoming payments" list: unpaid costs with a due date, soonest first.
 * Server-safe (no client interactivity) so it can be mounted straight from
 * async server components. Renders nothing when there's nothing due.
 */
export function UpcomingPaymentsCard({ payments, tripSlug }: UpcomingPaymentsCardProps) {
  if (payments.length === 0) return null;

  const href = tripPath(tripSlug, "/budget");

  return (
    <Card
      role="region"
      className="p-4"
      aria-labelledby="upcoming-payments-heading"
    >
      <h3 id="upcoming-payments-heading" className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground">
        Upcoming payments
      </h3>
      <ul className="mt-2 flex flex-col divide-y divide-border-soft">
        {payments.map((payment) => {
          const overdue = payment.daysUntil < 0;
          const amount = paymentAmountParts(payment, formatMoney);
          return (
            <li key={payment.costId}>
              <Link
                href={href}
                className="flex min-h-11 items-center gap-x-3 gap-y-1 py-2 text-[13px] transition-colors hover:bg-muted/40"
              >
                <span className={cn(ROW_NAME_CLASS, "font-extrabold text-foreground")}>{payment.label}</span>
                <span className={cn(ROW_FIGURE_CLASS, "flex flex-col items-end")}>
                  <span className="font-extrabold text-foreground">{amount.main}</span>
                  {amount.original ? (
                    <span className="text-xs font-semibold text-muted-foreground">{amount.original}</span>
                  ) : null}
                </span>
                {/* Overdue is a state, so it takes the status token, not an accent hue. */}
                {overdue ? (
                  <Badge variant="destructive" className="shrink-0">
                    {timingPhrase(payment.daysUntil)}
                  </Badge>
                ) : (
                  <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground">
                    {timingPhrase(payment.daysUntil)}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
