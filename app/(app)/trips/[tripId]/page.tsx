import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { todayISO } from "@/lib/dates";
import { computeTripPhase } from "@/lib/trip-phase";
import { PhaseSketching } from "@/components/trip/home/phase-sketching";
import { PhasePlanning } from "@/components/trip/home/phase-planning";
import { PhaseTravelling } from "@/components/trip/home/phase-travelling";
import { PhasePast } from "@/components/trip/home/phase-past";

export default async function TripHomePage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { id: true, name: true, startDate: true, endDate: true, homeCurrency: true },
  });
  if (!trip) notFound();

  const today = todayISO();
  const phase = computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today });

  switch (phase) {
    case "sketching":
      return <PhaseSketching tripId={tripId} tripName={trip.name} />;
    case "travelling":
      return <PhaseTravelling tripId={tripId} />;
    case "past":
      return <PhasePast tripId={tripId} trip={trip} />;
    default: // planning | final-prep
      return <PhasePlanning tripId={tripId} trip={trip} today={today} phase={phase} />;
  }
}
