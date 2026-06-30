import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the shared trip shell.
 *
 * Mirrors the layout produced by [tripId]/layout.tsx:
 *   - Trip header (title + date badge + member avatars)
 *   - Nav tab strip
 *   - Generic content area (cover image block + a few card-shaped rows)
 */
export default function TripLoading() {
  return (
    <div className="flex flex-col gap-0">
      {/* Trip header */}
      <div className="pb-4 pt-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            {/* Trip name */}
            <Skeleton className="h-8 w-56" />
            {/* Date range + currency badge */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
          </div>

          {/* Member avatars + notification bell */}
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="size-8 rounded-full ring-2 ring-background" />
              ))}
            </div>
            <Skeleton className="size-8 rounded-full" />
          </div>
        </div>
      </div>

      {/* Nav tab strip */}
      <div className="flex gap-1 border-b border-border pb-1">
        {[80, 64, 72, 56, 80].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-md" style={{ width: w }} />
        ))}
      </div>

      {/* Page content placeholder */}
      <div className="py-6">
        {/* Cover image placeholder */}
        <Skeleton className="mb-4 h-40 w-full rounded-2xl sm:h-48" />
        {/* Content card rows */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
