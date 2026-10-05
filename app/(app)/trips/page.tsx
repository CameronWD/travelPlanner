import type { Metadata } from "next";
import { requireUser } from "@/lib/guards";
import { WhatsNewBanner } from "@/components/whats-new/whats-new-banner";
import { WelcomeGate } from "@/components/welcome/welcome-gate";
import { InstallNudge } from "@/components/trips/install-nudge";
import { loadTripsPage } from "@/lib/trips/trips-page-loader";
import { loadRecentlyDeleted } from "@/lib/trips/recently-deleted-loader";
import { RecentlyDeleted } from "@/components/trips/recently-deleted";
import { tripsMetaLine } from "@/lib/trips/trip-status";
import { TripsHeader } from "@/components/trips/trips-header";
import { TripCarousel, CarouselTrack, CarouselDots, CAROUSEL_TRACK_HEIGHT_CLASS } from "@/components/trips/trip-carousel";
import { TripCard } from "@/components/trips/trip-card";
import { TripCardHero } from "@/components/trips/trip-card-hero";
import { TravelsMapResponsive } from "@/components/trips/travels-map-responsive";
import { TallyCard, TallyStrip } from "@/components/trips/tally-card";
import { TallyEmpty } from "@/components/trips/tally-empty";
import { FirstTripCard } from "@/components/trips/first-trip-card";
import { PastTripCard } from "@/components/trips/past-trip-card";
import { FRAME } from "@/lib/trips/trips-page-frame";
import { cn } from "@/lib/cn";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Your trips" };
}

// md→xl: a fixed 360px (spec 2026-10-05 §B). The TallyCard is
// `container-type: size` (globals.css), so it can't size this row itself;
// without a height the row collapsed to the map's 150px min and the tally
// overflowed. ≥xl the row is flex-1 inside the one-screen FRAME instead
// (xl:h-auto undoes the fixed height there; xl sorts after md).
const TRAVELS_ROW = "grid grid-cols-12 gap-[18px] pr-[18px] md:pr-10 md:h-[360px] xl:h-auto xl:min-h-0 xl:flex-1 xl:[@media(max-height:819px)]:min-h-[360px]";

export default async function TripsPage() {
  const user = await requireUser();
  // Always the real plan; never wire in ?plan= here (architecture-sitrep-2026-09-22).
  const [data, deletedTrips] = await Promise.all([
    loadTripsPage(user.id),
    loadRecentlyDeleted(user.id),
  ]);
  const firstRun = data.cards.length === 0;
  const hero = data.cards[0]?.kind === "up-next" || data.cards[0]?.kind === "on-the-road" ? data.cards[0] : null;
  const rest = hero ? data.cards.slice(1) : data.cards;
  const showTally = data.stats != null;
  const tallyEmpty = !data.anyStops;

  return (
    <TripCarousel>
      <div data-trips-shell className={FRAME}>
        <TripsHeader firstName={data.firstName} metaLine={tripsMetaLine(data.counts)} firstRun={firstRun} />
        <WhatsNewBanner className="mr-[18px] md:mr-10" />
        <WelcomeGate />
        <InstallNudge className="mr-[18px] md:mr-10" />

        {firstRun ? (
          <>
            {/* Row 1 — desktop: first-trip 8 / past-trip 4; mobile: stacked. */}
            <div className="grid grid-cols-12 gap-3.5 pr-[18px] md:h-[280px] md:gap-[18px] md:pr-10">
              <div className="col-span-12 md:col-span-8"><div className="md:hidden"><FirstTripCard variant="mobile" /></div><div className="hidden h-full md:block"><FirstTripCard variant="desktop" /></div></div>
              <div className="col-span-12 md:col-span-4"><div className="md:hidden"><PastTripCard variant="mobile" /></div><div className="hidden h-full md:block"><PastTripCard variant="desktop" /></div></div>
            </div>
            <div className={cn(TRAVELS_ROW, "md:mt-2")}>
              <div className="col-span-12 min-h-[150px] md:col-span-8 md:h-full"><TravelsMapResponsive trips={[]} empty /></div>
              <div className="col-span-12 hidden md:col-span-4 md:block"><TallyEmpty /></div>
            </div>
          </>
        ) : (
          <>
            <CarouselTrack className={cn(CAROUSEL_TRACK_HEIGHT_CLASS, "gap-3 md:gap-[18px]")}>
              {hero ? <TripCardHero model={hero} /> : null}
              {rest.map((m) => <TripCard key={m.id} model={m} />)}
            </CarouselTrack>
            <CarouselDots className="-mt-1 md:-mt-1" />
            <div className={TRAVELS_ROW}>
              <div className={cn("col-span-12 min-h-[150px] md:h-full", showTally ? "md:col-span-8" : "md:col-span-12")}>
                <TravelsMapResponsive trips={data.mapTrips} empty={!data.anyStops} />
              </div>
              {showTally ? (
                <div className="col-span-12 md:col-span-4">
                  <div className="md:hidden">{tallyEmpty ? null : <TallyStrip stats={data.stats!} hasDoneTrip={data.hasDoneTrip} />}</div>
                  <div className="hidden h-full md:block">{tallyEmpty ? <TallyEmpty /> : <TallyCard stats={data.stats!} hasDoneTrip={data.hasDoneTrip} />}</div>
                </div>
              ) : null}
            </div>
          </>
        )}

        {deletedTrips.length > 0 ? <RecentlyDeleted trips={deletedTrips} /> : null}
      </div>
    </TripCarousel>
  );
}
