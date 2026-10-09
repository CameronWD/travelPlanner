import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { formatMoneyWhole } from "@/lib/money/format-parts";
import { perNightMinor, perPersonMinor } from "@/lib/money/summary-lines";
import type { BudgetTotals } from "@/lib/budget";
import { MoneyEntrance } from "./money-entrance";
import { MoneyCountUp } from "./money-count-up";
import { PaidBar } from "./paid-bar";

/** The teal hero tile: total, per night/each, settlement box, paid bar (MONEY.md §3). */
export function CostTile({
  tripId,
  homeCurrency,
  totals,
  paidSoFarMinor,
  nights,
  memberCount,
  showPaid,
  className,
  style,
}: {
  tripId: string;
  homeCurrency: string;
  totals: BudgetTotals;
  paidSoFarMinor: number;
  nights: number;
  memberCount: number;
  showPaid: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const total = totals.costTotalMinor;

  const perNight = perNightMinor(total, nights);
  const perPerson = perPersonMinor(total, memberCount);
  const subParts: string[] = [];
  if (perNight !== null) subParts.push(`${formatMoneyWhole(perNight, homeCurrency)} a night`);
  if (perNight !== null && perPerson !== null) subParts.push(`${formatMoneyWhole(perPerson, homeCurrency)} each`);

  return (
    <section
      aria-label="Trip cost"
      data-slot="cost-tile"
      className={cn(
        "grid grid-cols-1 gap-4 rounded-xl border-2 border-border bg-teal p-[18px] text-on-accent shadow-hard-3 [grid-template-areas:'head'_'bar'_'split'] lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[auto_1fr] lg:px-6 lg:py-[22px] lg:[grid-template-areas:'head_split'_'bar_bar']",
        className,
      )}
      style={style}
    >
      <MoneyEntrance tripId={tripId}>
        <div className="min-w-0 [grid-area:head]">
          <span className="inline-flex shrink-0 whitespace-nowrap rounded-full border-2 border-border bg-card px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-card-foreground">
            Trip cost
          </span>
          <p className="mt-2 flex items-baseline font-display font-extrabold tabular-nums leading-[.85] tracking-[-0.05em]">
            <MoneyCountUp minor={total} currency={homeCurrency} tripId={tripId} />
          </p>
          {subParts.length > 0 ? <p className="mt-3 text-[15px] font-bold">{subParts.join(" · ")}</p> : null}
        </div>

        <dl
          data-testid="settlement-box"
          className="grid grid-cols-2 overflow-hidden rounded-[16px] border-2 border-border bg-card text-card-foreground [grid-area:split]"
        >
          <div className="flex min-w-0 flex-col gap-0.5 px-3.5 py-2.5 first:border-r-2 first:border-border">
            <dt className="whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
              Before you go
            </dt>
            <dd className="font-display text-[19px] font-extrabold tabular-nums tracking-[-0.03em] lg:text-[26px]">
              {formatMoneyWhole(totals.beforeTotalMinor, homeCurrency)}
            </dd>
            {showPaid ? (
              <dd className="text-[13px] font-semibold">
                <span className="text-teal-text">{formatMoneyWhole(totals.beforePaidMinor, homeCurrency)} paid</span>
              </dd>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 px-3.5 py-2.5 first:border-r-2 first:border-border">
            <dt className="whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
              On the trip
            </dt>
            <dd className="font-display text-[19px] font-extrabold tabular-nums tracking-[-0.03em] lg:text-[26px]">
              {formatMoneyWhole(totals.onTripTotalMinor, homeCurrency)}
            </dd>
            {showPaid ? (
              <dd className="text-[13px] font-semibold">
                {totals.onTripPaidMinor > 0 ? (
                  <span className="text-teal-text">{formatMoneyWhole(totals.onTripPaidMinor, homeCurrency)} paid</span>
                ) : (
                  <span className="text-muted-foreground">Spend money</span>
                )}
              </dd>
            ) : null}
          </div>
        </dl>

        <div className="[grid-area:bar] lg:self-end">
          {showPaid ? (
            <PaidBar paidMinor={paidSoFarMinor} totalMinor={total} currency={homeCurrency} tripId={tripId} />
          ) : (
            <p className="text-sm font-semibold text-on-accent-muted">
              Paid tracking lives on the real plan. This shows the variant&apos;s costs only.
            </p>
          )}
        </div>
      </MoneyEntrance>
    </section>
  );
}
