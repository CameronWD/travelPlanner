import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import type { UpcomingPayment } from "@/lib/upcoming-payments";

interface UpcomingPaymentsCardProps {
  payments: UpcomingPayment[];
  tripId: string;
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
export function UpcomingPaymentsCard({ payments, tripId }: UpcomingPaymentsCardProps) {
  if (payments.length === 0) return null;

  const href = `/trips/${tripId}/budget`;

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
          return (
            <li key={payment.costId}>
              <Link
                href={href}
                className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px] transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1 truncate font-extrabold text-foreground">{payment.label}</span>
                <span className="shrink-0 tabular-nums font-extrabold text-foreground">
                  {formatMoney(payment.costMinor, payment.currency)}
                </span>
                {/* Overdue is a state, so it takes the status token, not an accent hue. */}
                {overdue ? (
                  <Badge variant="destructive" className="shrink-0">
                    {timingPhrase(payment.daysUntil)}
                  </Badge>
                ) : (
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">
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
