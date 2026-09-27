import { cn } from "@/lib/cn";
import { formatDayLabel } from "@/lib/dates";
import { planCountLabel } from "@/lib/day-view-model";
import type { DayViewData } from "@/lib/day-view-loader";
import { Timeline } from "@/components/trip/timeline";
import { DayIdeasRows } from "@/components/trip/day/day-ideas-rows";
import { DayFeasibility, type DayFeasibilityEntry } from "@/components/trip/day-feasibility";
import { NearbyWishlist } from "@/components/trip/nearby-wishlist";

/**
 * The Day plan card (DAY_VIEW §2 "Left", §3.6): "Day plan" h2 with the count;
 * the day's Timeline, or — on an empty day — up to three Day ideas (spec
 * decision 5), or the plain "Nothing planned yet" line; the dashed add row
 * (`addButton`, spec decision 7) as its footer. On desktop the body scrolls
 * inside the card once the plan outgrows the viewport.
 *
 * A planned day also keeps the old page's feasibility advisory and the
 * collapsible "Nearby from your Wishlist" rail (both come from the loader).
 */
export function DayPlanCard({ data, size, addButton }: { data: DayViewData; size: "desktop" | "phone"; addButton: React.ReactNode }) {
  const phone = size === "phone";
  const dateLabel = formatDayLabel(data.date);
  return (
    <section
      aria-labelledby={`day-plan-heading-${size}`}
      className={cn(
        "flex min-h-0 flex-col gap-3.5 border-2 border-border bg-card",
        phone ? "rounded-[20px] p-4 shadow-hard-2" : "h-full rounded-3xl px-6 py-[22px] shadow-hard-3",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`day-plan-heading-${size}`} className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-foreground">
          Day plan
        </h2>
        <span className="text-right text-[13px] font-semibold text-muted-foreground">{planCountLabel(data.planCount)}</span>
      </div>
      <div className={cn("flex min-h-0 flex-col gap-3.5", !phone && "flex-1 lg:max-h-[max(20rem,calc(100dvh-22rem))] lg:overflow-y-auto")}>
        {data.hasEntries ? (
          <>
            <Timeline
              day={data.plan}
              variant="day"
              size="large"
              itemDirections={data.itemDirections}
              attachmentsByTarget={data.attachmentsByTarget}
              showUnschedule
              editor={data.editor}
            />
            <DayFeasibility entries={data.feasibility as DayFeasibilityEntry[]} />
            <NearbyWishlist tripId={data.tripId} date={data.date} items={data.nearby} />
          </>
        ) : data.ideas.rows.length > 0 ? (
          <DayIdeasRows
            tripId={data.tripId}
            date={data.date}
            dateLabel={dateLabel}
            rows={data.ideas.rows}
            more={data.ideas.more}
            eyebrow={data.ideas.eyebrow}
            seeAllHref={`/trips/${data.tripId}/wishlist`}
            size={size}
          />
        ) : (
          <p className="text-sm font-medium text-muted-foreground">Nothing planned yet. Add a place, an activity or a note.</p>
        )}
      </div>
      <div className="mt-auto">{addButton}</div>
    </section>
  );
}
