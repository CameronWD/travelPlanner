import Link from "next/link";
import { cn } from "@/lib/cn";
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
    <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="upcoming-payments-heading">
      <h3 id="upcoming-payments-heading" className="font-display text-base font-bold text-foreground">
        Upcoming payments
      </h3>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {payments.map((payment) => {
          const overdue = payment.daysUntil < 0;
          return (
            <li key={payment.costId}>
              <Link
                href={href}
                className="flex items-center gap-3 py-2 text-sm transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">{payment.label}</span>
                <span className="shrink-0 tabular-nums font-medium text-foreground">
                  {formatMoney(payment.costMinor, payment.currency)}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    overdue ? "text-warning" : "text-muted-foreground",
                  )}
                >
                  {timingPhrase(payment.daysUntil)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
