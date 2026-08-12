import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { SpendSoFar } from "@/lib/spend-so-far";

interface SpendSoFarCardProps {
  spend: SpendSoFar;
  homeCurrency: string;
  compact?: boolean;
}

export function SpendSoFarCard({ spend, homeCurrency, compact = false }: SpendSoFarCardProps) {
  const { costTotalMinor, paidSoFarMinor, varianceMinor, costRemainingMinor, tripElapsedPct } = spend;

  // Render a placeholder when there's no spend data at all
  const noData = costTotalMinor === 0 && paidSoFarMinor === 0;
  if (noData) {
    return compact ? null : (
      <EmptyState
        icon={Wallet}
        title="No spend data yet."
        description="Add costs to your stops and items to track your budget here."
      />
    );
  }

  if (compact) {
    const paid = formatMoney(paidSoFarMinor, homeCurrency);
    const est = formatMoney(costTotalMinor, homeCurrency);
    const abs = varianceMinor !== 0 ? formatMoney(Math.abs(varianceMinor), homeCurrency) : null;
    const direction = varianceMinor > 0 ? "over" : "under";
    return (
      <p className="text-sm text-muted-foreground">
        Paid {paid} of {est} cost{abs ? ` · ${abs} ${direction}` : ""}
      </p>
    );
  }

  // Full card variant
  const absVariance = Math.abs(varianceMinor);
  const isOver = varianceMinor > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spend so far</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {/* Cost total */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground min-w-0 truncate">Cost total</span>
            <span className="tabular-nums font-medium">
              {formatMoney(costTotalMinor, homeCurrency)}
            </span>
          </div>

          {/* Paid so far with variance chip */}
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium min-w-0 truncate">Paid so far</span>
            <div className="flex flex-col items-end gap-0.5">
              <span className="tabular-nums font-semibold">
                {formatMoney(paidSoFarMinor, homeCurrency)}
              </span>
              {varianceMinor !== 0 && (
                <div className="flex items-center gap-1 text-sm">
                  {isOver ? (
                    <TrendingUp
                      className="size-3.5 text-over"
                      aria-hidden="true"
                    />
                  ) : (
                    <TrendingDown
                      className="size-3.5 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={
                      isOver
                        ? "text-over"
                        : "text-emerald-700 dark:text-emerald-400"
                    }
                  >
                    {formatMoney(absVariance, homeCurrency)} {isOver ? "over" : "under"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Cost remaining */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground min-w-0 truncate">Cost remaining</span>
            <span className="tabular-nums font-medium">
              {formatMoney(costRemainingMinor, homeCurrency)}
            </span>
          </div>

          {/* Trip elapsed footer */}
          {tripElapsedPct != null && (
            <p className="mt-1 text-xs text-muted-foreground border-t border-border pt-2">
              ≈{tripElapsedPct}% of the trip elapsed
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
