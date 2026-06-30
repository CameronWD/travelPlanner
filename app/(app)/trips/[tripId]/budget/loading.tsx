import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the Budget page.
 *
 * Mirrors the layout produced by [tripId]/budget/page.tsx:
 *   - Grand total hero card (estimated total + spent so far)
 *   - Legend row (Estimated / Spent labels)
 *   - "By category" card with progress-bar rows
 *   - "By destination" card with list rows
 */
export default function BudgetLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Grand total hero card */}
      <div className="rounded-xl border border-border bg-card shadow-soft">
        <div className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-10 w-40" />
            </div>
            <div className="flex flex-col gap-1 sm:items-end">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          </div>
        </div>
      </div>

      {/* Legend row */}
      <div className="flex items-center justify-end gap-4 px-1">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-10" />
      </div>

      {/* By category card */}
      <div className="rounded-xl border border-border bg-card shadow-soft">
        <div className="p-6 pb-4">
          <Skeleton className="mb-4 h-5 w-24" />
          <div className="flex flex-col gap-3">
            {["Accommodation", "Transport", "Activities", "Other"].map((cat) => (
              <div key={cat} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 w-28" />
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-3.5 w-6" />
                    <Skeleton className="h-3.5 w-20" />
                  </div>
                </div>
                {/* Progress bar */}
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* By destination card */}
      <div className="rounded-xl border border-border bg-card shadow-soft">
        <div className="p-6 pb-4">
          <Skeleton className="mb-4 h-5 w-28" />
          <div className="flex flex-col divide-y divide-border">
            {[60, 48, 56, 44].map((w, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 gap-2">
                <Skeleton className="h-4" style={{ width: w * 2 }} />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
