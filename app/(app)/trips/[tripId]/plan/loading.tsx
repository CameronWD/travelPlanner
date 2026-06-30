import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the Plan page.
 *
 * Mirrors the layout produced by [tripId]/plan/page.tsx:
 *   - PlanOverview banner (dates + stat chips)
 *   - ItineraryManager: a vertical list of stop cards, each with a name,
 *     date range, and optional transport connector between stops.
 */
export default function PlanLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* PlanOverview banner */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>

      {/* Stop cards */}
      <div className="flex flex-col gap-0">
        {[1, 2, 3, 4].map((i) => (
          <div key={i}>
            {/* Stop card */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1.5">
                  {/* Stop name */}
                  <Skeleton className="h-5 w-40" />
                  {/* Date range */}
                  <Skeleton className="h-3.5 w-32" />
                </div>
                {/* Nights badge */}
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              {/* Accommodation row */}
              <div className="flex items-center gap-2">
                <Skeleton className="size-3.5 rounded-sm" />
                <Skeleton className="h-3.5 w-48" />
              </div>
            </div>

            {/* Transport connector between stops */}
            {i < 4 && (
              <div className="mx-5 my-1 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                <Skeleton className="size-3.5 rounded-sm" />
                <Skeleton className="h-3.5 w-36" />
              </div>
            )}
          </div>
        ))}

        {/* Add stop button placeholder */}
        <Skeleton className="mt-3 h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}
