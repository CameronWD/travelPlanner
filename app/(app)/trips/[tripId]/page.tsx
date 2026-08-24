import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
import { computeTripPhase } from "@/lib/trip-phase";
import { PhaseSketching } from "@/components/trip/home/phase-sketching";
import { PhasePlanning } from "@/components/trip/home/phase-planning";
import { PhaseTravelling } from "@/components/trip/home/phase-travelling";
import { PhasePast } from "@/components/trip/home/phase-past";
import { TripCover } from "@/components/trip/trip-cover";
import { orderPlanStops } from "@/lib/plan-order";

export default async function TripHomePage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      homeCurrency: true,
      drivingWindingFactor: true,
      drivingAvgSpeedKph: true,
      coverImageKey: true,
      homeName: true,
      homeLat: true,
      homeLng: true,
      homeCountryCode: true,
      roundTrip: true,
      chaptersEnabled: true,
      stops: {
        where: { forkId: null, arriveDate: { not: null } },
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true, timezone: true, arriveDate: true, departDate: true },
      },
    },
  });
  if (!trip) notFound();

  const coverStopsRaw = await db.stop.findMany({
    where: { tripId, forkId: null, lat: { not: null }, lng: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true, arriveDate: true, departDate: true, lat: true, lng: true },
  });
  // ADR 0038: a scheduled stop's position IS its dates — the cover map's
  // route order must follow canonical plan order, not raw sortOrder.
  const coverStops = orderPlanStops(coverStopsRaw);

  // Same canonical order for the "current timezone" pick — trip.stops is
  // fetched by sortOrder, which no longer tracks date order under ADR 0038.
  const today = todayISOInZone(currentTripTimezone(orderPlanStops(trip.stops)));
  const phase = computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today });

  const cover = (
    <div className="relative -mt-2 mb-2 h-40 w-full overflow-hidden rounded-2xl border border-border shadow-soft sm:h-48">
      <TripCover
        tripId={tripId}
        name={trip.name}
        hasCover={trip.coverImageKey != null}
        stops={coverStops.map((s) => ({ lat: s.lat as number, lng: s.lng as number }))}
        home={trip.homeLat != null && trip.homeLng != null ? { lat: trip.homeLat, lng: trip.homeLng } : null}
        roundTrip={trip.roundTrip ?? false}
      />
    </div>
  );

  const phaseEl = (() => {
    switch (phase) {
      case "sketching":
        return <PhaseSketching tripId={tripId} tripName={trip.name} chaptersEnabled={trip.chaptersEnabled} />;
      case "travelling":
        return <PhaseTravelling tripId={tripId} />;
      case "past":
        return <PhasePast tripId={tripId} trip={trip} />;
      default: // planning | final-prep
        return <PhasePlanning tripId={tripId} trip={trip} today={today} phase={phase} />;
    }
  })();

  return <>{cover}{phaseEl}</>;
}
