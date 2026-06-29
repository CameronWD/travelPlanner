import { MapPin, Moon, CalendarRange, Flag } from "lucide-react";
import { formatLongDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { PlanSummary, HardEndState } from "@/lib/plan-overview";
import { HardEndDateControl } from "./hard-end-date-control";
import { MakeItFit } from "./make-it-fit";
import type { FitStop } from "@/lib/make-it-fit";

interface PlanOverviewProps {
  tripId: string;
  summary: PlanSummary;
  startDate: string | null;
  fitStops: FitStop[];
}

const HARD_END_TONE: Record<HardEndState, string> = {
  unset: "text-muted-foreground",
  dormant: "text-muted-foreground",
  // 'ok' shows spare nights but stays muted — reassurance, not an alert.
  ok: "text-muted-foreground",
  approaching: "text-amber-600 dark:text-amber-400",
  over: "text-destructive",
};

function pluralNights(n: number): string {
  return `${n} night${n === 1 ? "" : "s"}`;
}

function hardEndStatusText(summary: PlanSummary): string | null {
  const { hardEndState, hardEndSlackNights } = summary;
  if (hardEndState === "over" && hardEndSlackNights != null) {
    return `${pluralNights(-hardEndSlackNights)} over`;
  }
  if (hardEndState === "approaching" && hardEndSlackNights != null) {
    return hardEndSlackNights === 0 ? "ends right on it" : `${pluralNights(hardEndSlackNights)} spare`;
  }
  if (hardEndState === "ok" && hardEndSlackNights != null) {
    return `${pluralNights(hardEndSlackNights)} spare`;
  }
  if (hardEndState === "dormant") return "set a start date to check this";
  return null;
}

export function PlanOverview({ tripId, summary, startDate, fitStops }: PlanOverviewProps) {
  const {
    stopCount, roughCount, scheduledNights, projectedNights,
    spanStart, scheduledEnd, projectedEnd, hardEndDate, hardEndState,
  } = summary;

  const hasRough = roughCount > 0;
  const statusText = hardEndStatusText(summary);

  return (
    <section
      aria-label="Trip overview"
      className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/40 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6"
    >
      {/* Stops */}
      <div className="flex items-center gap-2">
        <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm">
          <span className="font-semibold text-foreground">{stopCount} stop{stopCount === 1 ? "" : "s"}</span>
          {hasRough && <span className="text-muted-foreground"> · {roughCount} rough</span>}
        </span>
      </div>

      {/* Nights */}
      <div className="flex items-center gap-2">
        <Moon className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm">
          <span className="font-semibold text-foreground">{pluralNights(scheduledNights)}</span>
          {hasRough && <span className="text-muted-foreground"> scheduled · {projectedNights} projected</span>}
        </span>
      </div>

      {/* Date span */}
      <div className="flex items-center gap-2">
        <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">
          {spanStart ? (
            <>
              <span className="text-foreground">{formatLongDate(spanStart)}</span>
              {scheduledEnd && <> → <span className="text-foreground">{formatLongDate(scheduledEnd)}</span></>}
              {hasRough && projectedEnd && <> · ~{formatLongDate(projectedEnd)} projected</>}
            </>
          ) : (
            "No dates yet"
          )}
        </span>
      </div>

      {/* Hard end date. sm:ml-auto pushes this to the right on a single row; it
          harmlessly collapses when the row wraps on narrow viewports. */}
      <div className="flex items-center gap-2 sm:ml-auto">
        <Flag className={cn("size-4", HARD_END_TONE[hardEndState])} aria-hidden="true" />
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Hard end date</span>
          <span className="flex flex-wrap items-center gap-1 text-sm">
            <HardEndDateControl tripId={tripId} hardEndDate={hardEndDate} startDate={startDate} />
            {/* Live region is the status text ALONE — never the interactive control. */}
            {statusText && (
              <span role="status" aria-live="polite" className={cn("ml-1", HARD_END_TONE[hardEndState])}>
                {statusText}
              </span>
            )}
            {summary.hardEndState === "over" && (
              <MakeItFit tripId={tripId} stops={fitStops} anchor={startDate} hardEndDate={summary.hardEndDate} />
            )}
          </span>
        </div>
      </div>
    </section>
  );
}
