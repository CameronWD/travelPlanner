import { cn } from "@/lib/cn";
import { mergeToPay, type ToPayInput } from "@/lib/money/to-pay";
import type { CostRow } from "@/server/actions/costs";
import { ToPayPanel } from "./to-pay-panel";

/** The To pay card: one merged list of unpaid + recently-paid costs (MONEY.md §4). */
export function ToPayCard({
  tripId,
  homeCurrency,
  today,
  costs,
  costRows,
  ratesFooter,
  className,
}: {
  tripId: string;
  homeCurrency: string;
  today: string;
  costs: ToPayInput[];
  costRows: CostRow[];
  ratesFooter?: React.ReactNode;
  className?: string;
}) {
  const rows = mergeToPay(costs, { today, homeCurrency });

  return (
    <section
      aria-labelledby="to-pay-heading"
      data-slot="to-pay"
      className={cn(
        "flex min-h-0 flex-col rounded-xl border-2 border-border bg-card p-[18px] text-card-foreground shadow-hard-3 lg:px-[22px] lg:py-5",
        className,
      )}
    >
      <ToPayPanel tripId={tripId} homeCurrency={homeCurrency} rows={rows} costs={costRows} ratesFooter={ratesFooter} />
    </section>
  );
}
