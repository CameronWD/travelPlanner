"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { RefundDialog } from "@/components/money/refund-dialog";
import { formatMoneyWhole } from "@/lib/money/format-parts";
import type { ToPayRow } from "@/lib/money/to-pay";
import type { CostRow } from "@/lib/money/cost-row";

/** The expected Refunds on paid Costs, each with a way to say it arrived. Renders nothing with none. */
export function RefundsWaitingCard({ rows, costs, homeCurrency }: { rows: ToPayRow[]; costs: CostRow[]; homeCurrency: string }) {
  const [receiving, setReceiving] = React.useState<string | null>(null);
  if (rows.length === 0) return null;
  const cost = receiving ? costs.find((c) => c.id === receiving) : undefined;

  return (
    <section
      aria-labelledby="refunds-waiting-heading"
      className="rounded-xl border-2 border-border bg-card p-[18px] text-card-foreground shadow-hard-3 lg:px-[22px] lg:py-5"
    >
      <h2 id="refunds-waiting-heading" className="font-display text-[19px] font-extrabold tracking-[-0.02em] md:text-[22px]">
        Refunds you’re waiting on
      </h2>
      <ul className="mt-2">
        {rows.map((row) => {
          const refund = row.refund!;
          const refundCurrency = row.paidCurrency ?? row.currency;
          const home = refund.homeMinor != null && refundCurrency.toUpperCase() !== homeCurrency.toUpperCase();
          return (
            <li key={row.id} className="flex min-h-[52px] items-center gap-2 border-b-2 border-muted py-2.5 last:border-b-0">
              <p className="min-w-0 flex-1 truncate text-sm font-bold">{row.label}</p>
              <div className="shrink-0 text-right">
                <p className="text-[15px] font-extrabold tabular-nums">
                  {refund.homeMinor != null ? formatMoneyWhole(refund.homeMinor, homeCurrency) : formatMoneyWhole(refund.minor, refundCurrency)}
                </p>
                {home ? <p className="text-[11px] font-semibold tabular-nums text-muted-foreground">{formatMoneyWhole(refund.minor, refundCurrency)}</p> : null}
              </div>
              <Button variant="outline" size="sm" aria-label={`Received, ${row.label}`} onClick={() => setReceiving(row.id)}>
                Received
              </Button>
            </li>
          );
        })}
      </ul>
      {cost ? <RefundDialog cost={cost} receiving onClose={() => setReceiving(null)} /> : null}
    </section>
  );
}
