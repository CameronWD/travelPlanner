import { cn } from "@/lib/cn";
import { formatDateRange } from "@/lib/dates";
import { currencySymbol } from "@/lib/money";
import type { PhaseDescription } from "@/lib/trip-phase";

interface CountdownHeroProps {
  description: PhaseDescription;
  startDate: string | null;
  endDate: string | null;
  /** Trip length in nights: daysBetween(startDate, endDate). */
  nights: number;
  /** Total stops on the plan (dated + rough). */
  stopCount: number;
  /** Trip home currency code, e.g. "JPY". */
  homeCurrency: string;
  /** Visually escalate (final-prep). */
  urgent?: boolean;
}

/** Bold-Modular solid coral countdown block at the top of Home (planning / final-prep). */
export function CountdownHero({
  description,
  startDate,
  endDate,
  nights,
  stopCount,
  homeCurrency,
  urgent,
}: CountdownHeroProps) {
  const range = startDate && endDate ? formatDateRange(startDate, endDate) : null;
  const symbol = currencySymbol(homeCurrency);
  const currencyPill = symbol && symbol !== homeCurrency ? `${homeCurrency} ${symbol}` : homeCurrency;
  const ariaCountdown = description.countdownUnit
    ? `${description.countdownValue} ${description.countdownUnit.toLowerCase()}`
    : description.countdownValue;

  return (
    <section
      aria-label="Trip countdown"
      className="relative overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground shadow-[0_12px_30px_hsl(12_84%_50%/0.32)] dark:shadow-[0_12px_30px_hsl(0_0%_0%/0.4)]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 size-36 rounded-full bg-white/10"
      />

      <div className="relative flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]",
            urgent ? "bg-warning text-warning-foreground" : "bg-white/20",
          )}
        >
          {description.label}
        </span>
        {range && <span className="text-sm font-semibold opacity-95">{range}</span>}
      </div>

      <div role="img" aria-label={ariaCountdown} className="relative mt-3.5 flex items-baseline gap-3">
        <span className="font-display text-6xl font-bold leading-[0.9] tracking-[-0.03em]">
          {description.countdownValue}
        </span>
        {description.countdownUnit && (
          <span className="whitespace-pre-line font-display text-sm font-bold uppercase leading-tight tracking-[0.1em]">
            {description.countdownUnit.replace(" ", "\n")}
          </span>
        )}
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">
          {nights} {nights === 1 ? "night" : "nights"}
        </span>
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">
          {stopCount} {stopCount === 1 ? "stop" : "stops"}
        </span>
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">{currencyPill}</span>
      </div>
    </section>
  );
}
