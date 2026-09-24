import Link from "next/link";
import { formatMoneyCompact } from "@/lib/money";
import { StatCard } from "@/components/ui/stat-card";

interface BudgetGlanceProps {
  costTotalMinor: number;
  paidTotalMinor: number;
  homeCurrency: string;
  href: string;
}

/**
 * Kit DHome.jsx / Home.jsx "Spent" StatCard: paid so far over the trip's cost,
 * with a bar. The money is one shared pot, so the sub-line says so.
 */
export function BudgetGlance({ costTotalMinor, paidTotalMinor, homeCurrency, href }: BudgetGlanceProps) {
  const pct = costTotalMinor > 0 ? Math.min(100, Math.round((paidTotalMinor / costTotalMinor) * 100)) : 0;
  return (
    <Link href={href} className="block rounded-lg">
      <StatCard
        tone="sun"
        label="Paid so far"
        value={formatMoneyCompact(paidTotalMinor, homeCurrency)}
        progress={pct}
        sub={
          <>
            of {formatMoneyCompact(costTotalMinor, homeCurrency)} cost · shared pot
          </>
        }
        className="pressable hover:shadow-hard-3"
      />
    </Link>
  );
}
