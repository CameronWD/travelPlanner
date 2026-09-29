import { cn } from "@/lib/cn";
import { formatDayLabel } from "@/lib/dates";
import { planCountLabel } from "@/lib/day-view-model";
import type { DayViewData } from "@/lib/day-view-loader";
import { Timeline } from "@/components/trip/timeline";
import { DayIdeasRows } from "@/components/trip/day/day-ideas-rows";
import { DayFeasibility, type DayFeasibilityEntry } from "@/components/trip/day-feasibility";
import { NearbyWishlist } from "@/components/trip/nearby-wishlist";
import { DayMapPanel } from "@/components/trip/day-map-panel";

/**
 * The Day plan card (DAY_VIEW §2 "Left", §3.6): "Day plan" h2 with the count;
 * the day's Timeline, or — on an empty day — up to three Day ideas (spec
 * decision 5). The card sizes to its content (spec 2026-09-29 D5): an empty
 * day is a compact centred block, not a tall empty card, and a busy day
 * scrolls inside the card from lg once it outgrows the viewport. The dashed
 * add row (`addButton`, spec decision 7) is its footer.
 *
 * A planned day also keeps the old page's feasibility advisory and the
 * collapsible "Nearby from your Wishlist" rail (both come from the loader),
 * and the Day map (CONTEXT.md "Day map"), collapsed until opened.
 */
export function DayPlanCard({ data, size, addButton }: { data: DayViewData; size: "desktop" | "phone"; addButton: React.ReactNode }) {
  const phone = size === "phone";
  const dateLabel = formatDayLabel(data.date);
  const empty = !data.hasEntries && data.ideas.rows.length === 0;
  return (
    <section
      aria-labelledby={`day-plan-heading-${size}`}
      className={cn(
        "flex flex-col gap-3.5 border-2 border-border bg-card",
        phone ? "rounded-[20px] p-4 shadow-hard-2" : "rounded-3xl px-6 py-[22px] shadow-hard-3",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`day-plan-heading-${size}`} className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-foreground">
          Day plan
        </h2>
        <span className="text-right text-[13px] font-semibold text-muted-foreground">{planCountLabel(data.planCount)}</span>
      </div>
      {empty ? (
        // An empty day is a small block, not a tall empty card (spec 2026-09-29 D5):
        // about three or four Items' worth of room, the line and the add action centred.
        <div data-slot="day-plan-empty" className="flex min-h-[12rem] flex-col items-center justify-center gap-3.5 text-center">
          <p className="text-sm font-semibold text-muted-foreground">Nothing planned</p>
          <div className="w-full">{addButton}</div>
        </div>
      ) : (
        <>
          <div
            data-slot="day-plan-body"
            data-size={size}
            className={cn("flex flex-col gap-3.5", !phone && "lg:max-h-[max(20rem,calc(100dvh-22rem))] lg:overflow-y-auto")}
          >
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
                <DayMapPanel tripId={data.tripId} model={data.dayMap} />
                <DayFeasibility entries={data.feasibility as DayFeasibilityEntry[]} />
                <NearbyWishlist tripId={data.tripId} date={data.date} items={data.nearby} />
              </>
            ) : (
              <DayIdeasRows
                tripId={data.tripId}
                date={data.date}
                dateLabel={dateLabel}
                rows={data.ideas.all}
                eyebrow={data.ideas.eyebrow}
                size={size}
              />
            )}
          </div>
          <div>{addButton}</div>
        </>
      )}
    </section>
  );
}
