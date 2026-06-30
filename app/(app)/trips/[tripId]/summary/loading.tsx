import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the Summary page.
 *
 * Mirrors the layout produced by [tripId]/summary/page.tsx:
 *   - 4-cell stat bar (Stops / Nights / Budget / Flags)
 *   - Route map block
 *   - "Itinerary at a glance" section: numbered stop cards
 *   - "Budget summary" card
 *   - "Trip health" flags section
 */
export default function SummaryLoading() {
  return (
    <div className="flex flex-col gap-8">
      {/* Stat bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {["Stops", "Nights", "Budget", "Flags"].map((label) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-soft"
          >
            <div className="flex items-center gap-1.5">
              <Skeleton className="size-3.5 rounded-sm" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>

      {/* Route map placeholder */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-[380px] w-full rounded-2xl" />
      </section>

      {/* Itinerary at a glance */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-card p-5 shadow-soft"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    {/* Stop number circle */}
                    <Skeleton className="size-6 rounded-full" />
                    {/* Stop name */}
                    <Skeleton className="h-5 w-36" />
                    {/* Country */}
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="mt-1 h-3.5 w-44" />
                </div>
                {/* Stop budget */}
                <div className="flex flex-col items-end gap-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
              {/* Accommodation row */}
              <div className="flex items-center gap-2">
                <Skeleton className="size-3.5 rounded-sm" />
                <Skeleton className="h-3.5 w-40" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Budget summary card */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="rounded-xl border border-border bg-card shadow-soft">
          <div className="p-6">
            <Skeleton className="mb-4 h-5 w-28" />
            <div className="flex flex-wrap gap-6">
              <div className="flex flex-col gap-0.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-28" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trip health / flags section */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </section>
    </div>
  );
}
