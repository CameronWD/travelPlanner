import { TrendingUp, TrendingDown } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SpendSoFar } from "@/lib/spend-so-far";

interface SpendSoFarCardProps {
  spend: SpendSoFar;
  homeCurrency: string;
  compact?: boolean;
}

export function SpendSoFarCard({ spend, homeCurrency, compact = false }: SpendSoFarCardProps) {
  const { estimatedTotalMinor, paidSoFarMinor, varianceMinor, estimatedRemainingMinor, tripElapsedPct } = spend;

  // Render nothing when there's no spend data at all
  if (estimatedTotalMinor === 0 && paidSoFarMinor === 0) return null;

  if (compact) {
    const paid = formatMoney(paidSoFarMinor, homeCurrency);
    const est = formatMoney(estimatedTotalMinor, homeCurrency);
    const abs = varianceMinor !== 0 ? formatMoney(Math.abs(varianceMinor), homeCurrency) : null;
    const direction = varianceMinor > 0 ? "over" : "under";
    return (
      <p className="text-sm text-muted-foreground">
        Paid {paid} of {est} est.{abs ? ` · ${abs} ${direction}` : ""}
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
          {/* Estimated total */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground min-w-0 truncate">Estimated total</span>
            <span className="tabular-nums font-medium">
              {formatMoney(estimatedTotalMinor, homeCurrency)}
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
                      className="size-3.5 text-rose-600 dark:text-rose-400"
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
                        ? "text-rose-700 dark:text-rose-400"
                        : "text-emerald-700 dark:text-emerald-400"
                    }
                  >
                    {formatMoney(absVariance, homeCurrency)} {isOver ? "over" : "under"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Estimated remaining */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground min-w-0 truncate">Est. remaining</span>
            <span className="tabular-nums font-medium">
              {formatMoney(estimatedRemainingMinor, homeCurrency)}
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
