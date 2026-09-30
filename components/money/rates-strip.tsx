import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { RateEntry } from "@/components/trip/rates-panel";
import { RateCell } from "./rate-cell";

/** The sun tile: one cell per foreign currency, and the missing-rates line (MONEY.md §6). */
export function RatesStrip({
  tripId,
  homeCurrency,
  rates,
  note,
  missingLine,
  className,
}: {
  tripId: string;
  homeCurrency: string;
  rates: RateEntry[];
  note: string | null;
  missingLine: string | null;
  className?: string;
}) {
  if (rates.length === 0) return null;

  return (
    <section
      aria-labelledby="rates-heading"
      data-slot="rates-strip"
      className={cn("rounded-xl border-2 border-border bg-sun p-4 text-on-accent shadow-hard-3 lg:px-5", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="rates-heading" className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.08em]">
          Rates <ArrowRight className="size-3" aria-hidden="true" />
          <span className="sr-only">to</span> {homeCurrency}
        </h2>
        {note ? <p className="text-xs font-semibold text-on-accent-muted">{note}</p> : null}
      </div>
      <ul className="mt-2.5 grid grid-cols-3 gap-2">
        {rates.map((r) => (
          <li key={r.currency}>
            <RateCell tripId={tripId} homeCurrency={homeCurrency} entry={r} />
          </li>
        ))}
      </ul>
      {missingLine ? <p className="mt-2.5 text-[13px] font-semibold">{missingLine}</p> : null}
    </section>
  );
}
