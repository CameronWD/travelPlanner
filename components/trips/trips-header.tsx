import Link from "next/link";
import { Plus } from "lucide-react";
import { CarouselArrows } from "@/components/trips/trip-carousel";

export interface TripsHeaderProps {
  firstName: string;
  metaLine: string;
  /** No arrows and no "+ New trip": the first-trip card is the CTA (§7). */
  firstRun: boolean;
}

/** TRIPS_PAGE.md §3 (desktop) and §8.1 (mobile). Must sit inside <TripCarousel> for the arrows. */
export function TripsHeader({ firstName, metaLine, firstRun }: TripsHeaderProps) {
  return (
    <header className="flex items-end gap-4 pr-[18px] md:pr-10">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-muted-foreground md:text-[15px]">
          {firstRun ? `Welcome to teepee, ${firstName}` : `Hey ${firstName}`}
        </p>
        <h1 className="mt-0.5 font-display text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em] md:text-[40px]">Your trips</h1>
        <p className="mt-1.5 hidden text-[15px] font-semibold text-foreground md:block">{metaLine}</p>
      </div>
      {firstRun ? null : (
        <div className="flex items-center gap-2.5">
          <div className="hidden md:flex"><CarouselArrows /></div>
          <Link
            href="/trips/new"
            className="hidden h-11 shrink-0 items-center whitespace-nowrap rounded-full border-2 border-border bg-primary px-[18px] text-sm font-extrabold text-primary-foreground shadow-[4px_4px_0_hsl(var(--coral))] md:ml-1.5 md:inline-flex"
          >
            + New trip
          </Link>
          <Link
            href="/trips/new"
            aria-label="New trip"
            className="grid size-11 place-items-center rounded-full border-2 border-border bg-primary text-primary-foreground shadow-[3px_3px_0_hsl(var(--coral))] md:hidden"
          >
            <Plus className="size-5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </header>
  );
}
