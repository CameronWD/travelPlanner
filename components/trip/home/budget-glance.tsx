import Link from "next/link";
import { DollarSign, ArrowRight } from "lucide-react";
import { formatMoney } from "@/lib/money";

interface BudgetGlanceProps {
  estimatedMinor: number;
  actualMinor: number;
  homeCurrency: string;
  href: string;
}

/** Compact estimated/actual budget summary linking to the Budget tab. */
export function BudgetGlance({ estimatedMinor, actualMinor, homeCurrency, href }: BudgetGlanceProps) {
  const hasActual = actualMinor > 0;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft transition-colors hover:bg-muted/40"
    >
      <DollarSign className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="flex flex-1 flex-col">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {hasActual ? "Spent so far" : "Estimated budget"}
        </span>
        <span className="font-mono text-xl font-semibold text-foreground">
          {formatMoney(hasActual ? actualMinor : estimatedMinor, homeCurrency)}
        </span>
        {hasActual && (
          <span className="text-xs text-muted-foreground">
            of {formatMoney(estimatedMinor, homeCurrency)} estimated
          </span>
        )}
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
