/**
 * "Your travels" — Server Component (spec §M, CONTEXT.md "Your travels").
 * A Traveller's personal look back (and ahead) across every Trip they're on:
 * the Travel map (every Trip's route of located Stops, coloured by phase)
 * and the Travel stats tiles. Personal, derived, nothing stored — NEVER call
 * this "Globe" (that's the separate, shared, cross-trip places-you-want-to-go
 * map — components/globe/globe-view.tsx).
 *
 * Renders below the trip cards on `/trips` (app/(app)/trips/page.tsx), with
 * `id="your-travels"` for the page's "Your travels ↓" jump link.
 *
 * Empty states (controller ruling): Travel stats show whenever the
 * Traveller has ≥1 Trip — a Trip's dates/nights/transport counts don't need
 * a located Stop. Only the MAP area falls back to its own small empty state
 * when no Trip has a located Stop. The section is *entirely* an empty state
 * only when there are zero Trips at all (`mapTrips` — one entry per Trip,
 * located or not — is empty).
 */
import { Compass, MapPin } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { TravelMapLoader } from "@/components/trips/travel-map-loader";
import { TravelStatsTiles } from "@/components/trips/travel-stats-tiles";
import { loadYourTravels } from "@/lib/travel-stats-loader";
import { locatedTravelMapTrips } from "@/lib/travel-map-trips";
import { todayISO } from "@/lib/dates";

export interface YourTravelsProps {
  userId: string;
  /** Injectable for tests; defaults to the real today. */
  today?: string;
}

function SectionHeading() {
  return (
    <h2 id="your-travels-heading" className="font-display text-2xl font-extrabold tracking-[-0.03em]">
      Your travels
    </h2>
  );
}

export async function YourTravels({ userId, today = todayISO() }: YourTravelsProps) {
  const { stats, mapTrips } = await loadYourTravels(userId, today);
  const locatedTrips = locatedTravelMapTrips(mapTrips);

  // Zero Trips at all — the whole section is just the empty state.
  if (mapTrips.length === 0) {
    return (
      <section id="your-travels" aria-labelledby="your-travels-heading" className="scroll-mt-20 space-y-5">
        <SectionHeading />
        <EmptyState
          icon={Compass}
          title="Nothing here yet"
          description="Your trips will appear here once they have places"
        />
      </section>
    );
  }

  // At least one Trip: stats always show. Only the map area falls back to
  // its own empty state when no Trip has a located Stop.
  return (
    <section id="your-travels" aria-labelledby="your-travels-heading" className="scroll-mt-20 space-y-5">
      <SectionHeading />
      {locatedTrips.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No places on the map yet"
          description="Your trips will appear on the map once they have places"
        />
      ) : (
        <TravelMapLoader trips={locatedTrips} />
      )}
      <TravelStatsTiles stats={stats} />
    </section>
  );
}
