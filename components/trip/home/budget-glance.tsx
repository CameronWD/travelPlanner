import type { Route } from "next";
import Link from "next/link";
import { formatMoneyCompact } from "@/lib/money/money";
import { paidPct } from "@/lib/money/summary-lines";
import { StatCard } from "@/components/ui/stat-card";

interface BudgetGlanceProps {
  costTotalMinor: number;
  paidTotalMinor: number;
  homeCurrency: string;
  href: Route;
}

/**
 * Kit DHome.jsx / Home.jsx "Spent" StatCard: paid so far over the trip's cost,
 * with a bar.
 */
export function BudgetGlance({ costTotalMinor, paidTotalMinor, homeCurrency, href }: BudgetGlanceProps) {
  const pct = paidPct(paidTotalMinor, costTotalMinor);
  return (
    <Link href={href} className="block rounded-lg">
      <StatCard
        tone="sun"
        label="Paid so far"
        value={formatMoneyCompact(paidTotalMinor, homeCurrency)}
        progress={pct}
        sub={
          <>
            of {formatMoneyCompact(costTotalMinor, homeCurrency)} cost
          </>
        }
        className="pressable hover:shadow-hard-3"
      />
    </Link>
  );
}
