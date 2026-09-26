import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

/**
 * Server Components. Five loading.tsx archetypes; every route maps to one (README table).
 * Rules: skeleton blocks sit where real content will land (no layout jump), outlines are
 * border-soft (never ink — ink means "real"), one sr-only status per page, no shimmer sweep.
 */

function Status({ label }: { label: string }) {
  return <span role="status" className="sr-only">{label}</span>;
}

function Frame({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div aria-hidden="true" className={cn("rounded-lg border-2 border-border-soft bg-background p-3.5", className)}>{children}</div>;
}

function PageHead({ action = true }: { action?: boolean }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex flex-col gap-2"><Skeleton className="h-2.5 w-20" /><Skeleton className="h-8 w-48" /></div>
      {action ? <Skeleton className="hidden h-11 w-32 rounded-full lg:block" /> : null}
    </div>
  );
}

/** Trips, plan, wishlist, checklists, files, journal, activity, admin. */
export function ListSkeleton({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Status label={label} />
      <PageHead />
      <div className="flex gap-2"><Skeleton className="h-7 w-16 rounded-full" /><Skeleton className="h-7 w-20 rounded-full" /><Skeleton className="h-7 w-14 rounded-full" /></div>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <Frame key={i} className="flex items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-sm" />
            <div className="flex min-w-0 flex-1 flex-col gap-2"><Skeleton className="h-3.5" style={{ width: `${70 - (i % 3) * 12}%` }} /><Skeleton className="h-2.5 w-2/5" /></div>
            <Skeleton className="h-6 w-12 rounded-full" />
          </Frame>
        ))}
      </div>
    </div>
  );
}

/** Trip home, stop detail, summary, today, account, trip settings. */
export function DetailSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Status label={label} />
      <Frame className="flex min-h-40 flex-col gap-3 rounded-xl p-5"><Skeleton className="h-2.5 w-24" /><Skeleton className="h-9 w-3/5" /><Skeleton className="mt-auto h-3 w-2/5" /></Frame>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Frame key={i} className="flex h-24 flex-col gap-2"><Skeleton className="h-2.5 w-1/2" /><Skeleton className="h-6 w-2/3" /></Frame>)}
      </div>
      <Frame className="flex flex-col gap-2.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-2/3" /></Frame>
    </div>
  );
}

/** Calendar month grid and day view. */
export function CalendarSkeleton({ label = "Loading calendar" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Status label={label} />
      <PageHead action={false} />
      <div aria-hidden="true" className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={`h${i}`} className="mx-auto h-2.5 w-6" />)}
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className="flex aspect-square flex-col gap-1 rounded-sm border-2 border-border-soft p-1.5 md:aspect-[4/3]">
            <Skeleton className="h-2.5 w-4" />
            {i % 5 === 1 || i % 7 === 3 ? <Skeleton className="mt-auto h-1.5 w-full rounded-full" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Globe, route map, wishlist map, day map panel. The map box keeps its final height. */
export function MapSkeleton({ height = 340, label = "Loading map" }: { height?: number; label?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Status label={label} />
      <div aria-hidden="true" className="relative overflow-hidden rounded-xl border-2 border-border-soft bg-muted" style={{ height }}>
        <Skeleton className="absolute left-[22%] top-[38%] size-7 rounded-full" />
        <Skeleton className="absolute left-[48%] top-[55%] size-7 rounded-full" />
        <Skeleton className="absolute left-[70%] top-[30%] size-7 rounded-full" />
        <Skeleton className="absolute right-3 top-3 h-20 w-11 rounded-md" />
      </div>
      <div className="flex gap-2"><Skeleton className="h-7 w-24 rounded-full" /><Skeleton className="h-7 w-20 rounded-full" /></div>
    </div>
  );
}

/** Trip new, settings sections, any FormDialog page fallback. */
export function FormSkeleton({ fields = 4, label = "Loading" }: { fields?: number; label?: string }) {
  return (
    <div className="flex max-w-xl flex-col gap-5">
      <Status label={label} />
      <Skeleton className="h-8 w-1/2" />
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} aria-hidden="true" className="flex flex-col gap-2"><Skeleton className="h-2.5 w-24" /><div className="h-12 rounded-md border-2 border-border-soft" /></div>
      ))}
      <Skeleton className="h-[52px] w-full rounded-full md:w-40" />
    </div>
  );
}
