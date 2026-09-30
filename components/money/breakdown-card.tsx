import type { CSSProperties } from "react";
import { BedDouble, Ellipsis, Plane, Ticket, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { HUE_CLASSES } from "@/lib/hues";
import { formatMoneyWhole } from "@/lib/money/format-parts";
import type { BarSegment, BreakdownBy, BreakdownRow, MoneyCategoryIcon } from "@/lib/money/breakdown";
import { ChapterChip } from "@/components/trip/chapter-chip";
import { BreakdownSwitch } from "./breakdown-switch";
import { FadeSwap, StackedBar } from "./stacked-bar";

export const BREAKDOWN_ROW_CLASS =
  "grid grid-cols-[14px_minmax(0,1fr)_auto_70px] items-center gap-3 border-b-2 border-muted py-[9px] md:grid-cols-[28px_minmax(0,1fr)_56px_120px_110px] md:gap-3.5";

const ICON: Record<MoneyCategoryIcon, LucideIcon> = {
  transport: Plane,
  accommodation: BedDouble,
  activity: Ticket,
  food: UtensilsCrossed,
  other: Ellipsis,
};

/** The "Where it goes" card: Category · Place · Chapter · Day switch, stacked bar and rows (MONEY.md §5). */
export function BreakdownCard({
  by,
  options,
  rows,
  segments,
  homeCurrency,
  showPaid,
  className,
  style,
}: {
  by: BreakdownBy;
  options: { value: BreakdownBy; label: string }[];
  rows: BreakdownRow[];
  segments: BarSegment[];
  homeCurrency: string;
  showPaid: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section
      aria-labelledby="where-heading"
      data-slot="where-it-goes"
      className={cn(
        "flex min-h-0 flex-col rounded-xl border-2 border-border bg-card p-[18px] text-card-foreground shadow-hard-3 lg:px-6 lg:py-[22px]",
        className,
      )}
      style={style}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="where-heading" className="font-display text-[19px] font-extrabold tracking-[-0.02em] md:text-[22px]">
          Where it goes
        </h2>
        <BreakdownSwitch value={by} options={options} />
      </div>

      {by !== "day" && segments.length > 0 ? <StackedBar segments={segments} by={by} className="mt-4" /> : null}

      <FadeSwap swapKey={by} className="mt-2 flex min-h-0 flex-1 flex-col">
        <ul aria-label={`By ${by}`} className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((r) => {
            const Icon = r.icon ? ICON[r.icon] : null;
            return (
              <li key={r.key} aria-label={r.label} className={BREAKDOWN_ROW_CLASS}>
                {r.hue ? (
                  <span
                    data-testid="breakdown-swatch"
                    className={cn(
                      "size-3.5 rounded-full border-2 border-border md:grid md:size-7 md:place-items-center md:rounded-[9px]",
                      HUE_CLASSES[r.hue].fill,
                      "text-on-accent",
                    )}
                  >
                    {Icon ? <Icon className="hidden size-3.5 md:block" aria-hidden="true" /> : null}
                  </span>
                ) : (
                  <span />
                )}

                {r.chapterColour ? (
                  <ChapterChip name={r.label} colour={r.chapterColour} />
                ) : (
                  <span className={cn("flex min-w-0 items-center gap-2 text-[15px] font-bold", r.muted && "text-muted-foreground")}>
                    <span className={cn("truncate", r.muted && "text-muted-foreground")}>{r.label}</span>
                    {r.missingRate ? (
                      <span className="shrink-0 whitespace-nowrap rounded-full border-2 border-border bg-sun px-2 text-[11px] font-extrabold text-on-accent">
                        No rate
                      </span>
                    ) : null}
                  </span>
                )}

                <span className="text-right text-[13px] font-bold tabular-nums text-muted-foreground">
                  {r.pct != null ? `${r.pct}%` : ""}
                </span>

                <span className="hidden text-right text-[13px] font-semibold tabular-nums text-teal-text md:block">
                  {showPaid && r.paidMinor > 0 ? `${formatMoneyWhole(r.paidMinor, homeCurrency)} paid` : ""}
                </span>

                <span className="text-right text-base font-extrabold tabular-nums">{formatMoneyWhole(r.costMinor, homeCurrency)}</span>
              </li>
            );
          })}
        </ul>
      </FadeSwap>
    </section>
  );
}
