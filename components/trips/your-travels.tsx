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
 */
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { TravelMapLoader } from "@/components/trips/travel-map-loader";
import { TravelStatsTiles } from "@/components/trips/travel-stats-tiles";
import { loadYourTravels } from "@/lib/travel-stats-loader";
import { todayISO } from "@/lib/dates";

export interface YourTravelsProps {
  userId: string;
  /** Injectable for tests; defaults to the real today. */
  today?: string;
}

export async function YourTravels({ userId, today = todayISO() }: YourTravelsProps) {
  const { stats, mapTrips } = await loadYourTravels(userId, today);

  // Trips with no located Stops are omitted from the map (spec §M) — when
  // that leaves nothing at all, the whole section is just the empty state.
  const locatedTrips = mapTrips.filter((trip) => trip.points.length > 0);

  return (
    <section id="your-travels" aria-labelledby="your-travels-heading" className="scroll-mt-20 space-y-5">
      <h2 id="your-travels-heading" className="font-display text-2xl font-extrabold tracking-[-0.03em]">
        Your travels
      </h2>
      {locatedTrips.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="Your travels"
          description="Your trips will appear here once they have places"
        />
      ) : (
        <>
          <TravelMapLoader trips={locatedTrips} />
          <TravelStatsTiles stats={stats} />
        </>
      )}
    </section>
  );
}
