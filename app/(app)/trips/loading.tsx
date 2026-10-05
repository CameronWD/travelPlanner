import { Skeleton } from "@/components/ui/skeleton";
import { FRAME } from "@/lib/trips/trips-page-frame";

/**
 * TRIPS_PAGE.md §9: header at once; skeleton cards at real sizes; flat canvas
 * map; tally title + 4 cells. Carries the page's own FRAME padding (via
 * `data-trips-shell`, which drops <main>'s padding — see page.tsx) so the
 * skeleton doesn't double-pad under <main>'s while the real page streams in.
 */
export default function TripsLoading() {
  return (
    <div data-trips-shell className={FRAME}>
      <span role="status" className="sr-only">Loading trips</span>
      <header className="pr-[18px] md:pr-10">
        <h1 className="mt-1 font-display text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em] md:text-[40px]">Your trips</h1>
        <Skeleton className="mt-2 hidden h-3.5 w-36 md:block" />
      </header>
      <div aria-hidden="true" className="flex gap-3 overflow-hidden md:gap-[18px]">
        <div className="h-[250px] w-[300px] shrink-0 rounded-[22px] border-2 border-border-soft md:h-[280px] md:w-[600px] md:rounded-[24px]" />
        <div className="h-[250px] w-[220px] shrink-0 rounded-[22px] border-2 border-border-soft md:h-[280px] md:w-[300px] md:rounded-[24px]" />
        <div className="hidden h-[280px] w-[300px] shrink-0 rounded-[24px] border-2 border-border-soft md:block" />
      </div>
      <div aria-hidden="true" className="grid grid-cols-12 gap-[18px] pr-[18px] md:pr-10">
        <div className="col-span-12 h-[190px] rounded-[22px] border-2 border-border-soft bg-canvas md:col-span-8 md:h-[360px] md:rounded-[24px]" />
        <div className="col-span-12 hidden rounded-[24px] border-2 border-border-soft p-5 md:col-span-4 md:block">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="mt-3 h-12 w-24" />
          <div className="mt-8 grid grid-cols-2 gap-x-4">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="border-b-2 border-border-soft py-2"><Skeleton className="h-5 w-10" /><Skeleton className="mt-1 h-3 w-16" /></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
