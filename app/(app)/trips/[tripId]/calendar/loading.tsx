import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the Calendar page.
 *
 * Mirrors the layout produced by [tripId]/calendar/page.tsx → CalendarViews:
 *   - View-switcher toolbar (Month / Week / Day tabs)
 *   - Month grid: header row of day names + 5 rows of 7 day cells
 */
export default function CalendarLoading() {
  const DAYS = 7;
  const WEEKS = 5;

  return (
    <div className="flex flex-col gap-4">
      {/* View-switcher toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
          <Skeleton className="h-8 w-14 rounded-lg" />
        </div>
        {/* Nav arrows + current month label */}
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      </div>

      {/* Month grid */}
      <div className="overflow-hidden rounded-2xl border border-border">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {Array.from({ length: DAYS }).map((_, d) => (
            <div key={d} className="flex justify-center py-2">
              <Skeleton className="h-3 w-6" />
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7">
          {Array.from({ length: WEEKS }).map((_, week) =>
            Array.from({ length: DAYS }).map((_, day) => {
              const key = week * DAYS + day;
              return (
                <div
                  key={key}
                  className="min-h-[80px] border-b border-r border-border/60 p-1.5 last:border-r-0"
                >
                  {/* Day number */}
                  <Skeleton className="mb-1.5 size-6 rounded-full" />
                  {/* Occasional event pill placeholders */}
                  {key % 3 === 0 && <Skeleton className="mb-1 h-5 w-full rounded-md" />}
                  {key % 5 === 1 && <Skeleton className="h-5 w-3/4 rounded-md" />}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
