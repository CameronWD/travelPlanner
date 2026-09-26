import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  // Kit DHome.jsx / Home.jsx hero: coral island Card, white caps chip +
  // "dates · currency" label, the big display-xl count beside its unit.
  return (
    <Card
      role="region"
      aria-label="Trip countdown"
      tone="coral"
      shadow={3}
      radius="xl"
      className="flex flex-col p-[18px] lg:row-span-2 lg:min-h-0 lg:p-[22px]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Badge caps className={cn(urgent && "bg-warning text-warning-foreground")}>
          {description.label}
        </Badge>
        {range && <span className="text-label">{range}</span>}
      </div>

      <div role="img" aria-label={ariaCountdown} className="mt-3.5 flex items-baseline gap-2.5 lg:mt-auto lg:pt-6">
        <span className="font-display text-[88px] font-extrabold leading-[0.9] tracking-[-0.06em] lg:text-[120px]">
          {description.countdownValue}
        </span>
        {description.countdownUnit && (
          <span className="whitespace-pre-line font-display text-[22px] font-extrabold leading-[1.05] tracking-[-0.03em] lg:text-[28px]">
            {description.countdownUnit.toLowerCase().replace(" ", "\n")}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge>
          {nights} {nights === 1 ? "night" : "nights"}
        </Badge>
        <Badge>
          {stopCount} {stopCount === 1 ? "stop" : "stops"}
        </Badge>
        <Badge>{currencyPill}</Badge>
      </div>
    </Card>
  );
}
