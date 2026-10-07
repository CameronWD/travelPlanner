import Link from "next/link";
import { ChevronRight } from "lucide-react";

const PAST_TRIP_HREF = "/trips/new?past=1";

/** "Already been?" tile (desktop, TRIPS_PAGE.md §7) or row (mobile, §8). Opens the new-trip flow with its past flag (spec D1). */
export function PastTripCard({ variant }: { variant: "desktop" | "mobile" }) {
  if (variant === "mobile") {
    return (
      <Link href={PAST_TRIP_HREF} className="flex min-h-14 items-center gap-3 rounded-[18px] border-2 border-border bg-card px-3.5 py-3 shadow-hard-1">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[10px] border-2 border-border bg-teal font-display text-lg font-extrabold">+</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold text-foreground">Already been somewhere?</span>
          <span className="text-[13px] text-muted-foreground">Log a past trip for your map</span>
        </span>
        <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <section aria-label="Already been?" className="flex flex-col rounded-[24px] border-2 border-border bg-card p-[22px] shadow-hard-3">
      <span className="self-start whitespace-nowrap shrink-0 rounded-full border-2 border-border bg-teal px-2.5 py-[3px] text-[11px] font-extrabold tracking-[0.08em] text-on-accent">ALREADY BEEN?</span>
      <h2 className="mt-auto font-display text-[26px] font-extrabold leading-[1.05]">Log a past trip</h2>
      <p className="mt-1.5 text-sm leading-[1.45] text-foreground">Add where you went and when. It goes on your map and counts toward your tally.</p>
      <Link href={PAST_TRIP_HREF} className="mt-4 inline-flex h-11 w-fit shrink-0 items-center whitespace-nowrap rounded-full border-2 border-border bg-card px-[18px] text-sm font-extrabold text-foreground shadow-hard-1">
        + Past trip
      </Link>
    </section>
  );
}
