import Link from "next/link";
import { formatMoney } from "@/lib/money";

interface BudgetGlanceProps {
  estimatedMinor: number;
  actualMinor: number;
  homeCurrency: string;
  href: string;
}

/** Quiet "spent so far" strip: label + thin success bar + spent/estimated. */
export function BudgetGlance({ estimatedMinor, actualMinor, homeCurrency, href }: BudgetGlanceProps) {
  const pct = estimatedMinor > 0 ? Math.min(100, Math.round((actualMinor / estimatedMinor) * 100)) : 0;
  return (
    <Link href={href} className="flex items-center gap-3 rounded-full px-1 py-2 transition-colors hover:bg-muted/40">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Spent so far
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </span>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
        {formatMoney(actualMinor, homeCurrency)}{" "}
        <span className="font-medium text-muted-foreground">/ {formatMoney(estimatedMinor, homeCurrency)} est</span>
      </span>
    </Link>
  );
}
