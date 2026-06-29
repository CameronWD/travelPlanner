import { MapPin, Moon, CalendarRange, Flag } from "lucide-react";
import { formatLongDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { PlanSummary, HardEndState } from "@/lib/plan-overview";
import { HardEndDateControl } from "./hard-end-date-control";

interface PlanOverviewProps {
  tripId: string;
  summary: PlanSummary;
  startDate: string | null;
}

const HARD_END_TONE: Record<HardEndState, string> = {
  unset: "text-muted-foreground",
  dormant: "text-muted-foreground",
  ok: "text-muted-foreground",
  approaching: "text-amber-600 dark:text-amber-500",
  over: "text-destructive",
};

function hardEndStatusText(summary: PlanSummary): string | null {
  const { hardEndState, hardEndSlackNights } = summary;
  if (hardEndState === "over" && hardEndSlackNights != null) {
    const n = -hardEndSlackNights;
    return `${n} night${n === 1 ? "" : "s"} over`;
  }
  if (hardEndState === "approaching" && hardEndSlackNights != null) {
    return hardEndSlackNights === 0 ? "ends right on it" : `${hardEndSlackNights} night${hardEndSlackNights === 1 ? "" : "s"} spare`;
  }
  if (hardEndState === "ok" && hardEndSlackNights != null) {
    return `${hardEndSlackNights} nights spare`;
  }
  if (hardEndState === "dormant") return "set a start date to check this";
  return null;
}

export function PlanOverview({ tripId, summary, startDate }: PlanOverviewProps) {
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
          <span className="font-semibold text-foreground">{scheduledNights} night{scheduledNights === 1 ? "" : "s"}</span>
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

      {/* Hard end date */}
      <div className="flex items-center gap-2 sm:ml-auto">
        <Flag className={cn("size-4", HARD_END_TONE[hardEndState])} aria-hidden="true" />
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Hard end date</span>
          <span role="status" className={cn("text-sm", HARD_END_TONE[hardEndState])}>
            <HardEndDateControl tripId={tripId} hardEndDate={hardEndDate} startDate={startDate} />
            {statusText && <span className="ml-2">{statusText}</span>}
          </span>
        </div>
      </div>
    </section>
  );
}
