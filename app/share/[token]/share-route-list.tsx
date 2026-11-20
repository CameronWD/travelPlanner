import { Check, Route as RouteIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { stopDotClass } from "@/lib/stop-colours";
import { formatDateRangeCompact, formatNights } from "@/lib/dates";
import type { RouteListStopModel, ShareStage } from "@/lib/share/view";
import { cn } from "@/lib/cn";

/** A rough Stop (no dates) lists with its nights and "Dates to come" (spec 2026-10-13 D4). */
export type RouteListStop = RouteListStopModel;

function datesLine(stop: RouteListStop) {
  return stop.arriveDate && stop.departDate ? formatDateRangeCompact(stop.arriveDate, stop.departDate) : "Dates to come";
}

export interface ShareRouteListProps {
  stage: ShareStage;
  stops: RouteListStop[];
  className?: string;
}

/**
 * SHARE.md §5 — the route list. Outbound transport and accommodation no
 * longer show here; they live in Day by day. Money never appears.
 */
export function ShareRouteList({ stage, stops, className }: ShareRouteListProps) {
  const doneCount = stops.filter((s) => s.status === "past").length;
  const datedCount = stops.filter((s) => s.arriveDate !== null).length;

  return (
    <section
      data-slot="share-route"
      aria-labelledby="route-heading"
      className={cn("min-w-0 rounded-3xl border-2 border-border bg-card p-5 shadow-hard-4", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="route-heading"
          className="font-display text-[22px] font-extrabold leading-tight tracking-[-0.03em]"
        >
          The route
        </h2>
        <span className="shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums">
          {stage === "during" && `${doneCount} of ${datedCount} done`}
          {stage === "after" && (
            <span className="inline-flex items-center gap-1 text-teal-text">
              All {stops.length}
              <Check aria-hidden className="size-3.5" />
            </span>
          )}
        </span>
      </div>

      {stops.length === 0 ? (
        <EmptyState
          icon={RouteIcon}
          tone="teal"
          title="No stops yet"
          description="The route shows here once the trip has Stops."
          className="mt-3"
        />
      ) : (
        <ol className="mt-3 flex flex-col">
          {stops.map((stop, i) => (
            <li
              key={stop.id}
              className={cn(
                "flex min-h-[50px] flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap border-b-2 border-muted py-2 last:border-b-0",
                stage === "during" && stop.status === "current" && "rounded-xl border-transparent bg-coral/20 px-2",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border text-xs font-extrabold tabular-nums",
                  stopDotClass(stop.sortOrder),
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words font-display text-base font-extrabold sm:truncate">{stop.name}</p>
                <p className="truncate text-xs font-semibold text-muted-foreground">
                  {[stop.country, formatNights(stop.nights)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums max-sm:basis-full max-sm:pl-10">
                {stage === "before" && datesLine(stop)}
                {stage === "during" && stop.status === "past" && (
                  <span className="inline-flex items-center gap-1 text-teal-text">
                    <Check className="size-3.5" aria-hidden />
                    Been
                  </span>
                )}
                {stage === "during" && stop.status === "current" && (
                  <span className="text-coral-text">Here now</span>
                )}
                {stage === "during" && stop.status === "future" && datesLine(stop)}
                {stage === "after" && formatNights(stop.nights)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
