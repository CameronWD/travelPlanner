import { MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { EmptyState } from "@/components/ui/empty-state";
import { ItineraryManager } from "@/components/trip/itinerary-manager";
import type { TransportMode } from "@/lib/enums";

export default async function TripOverviewPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  const [stops, transports] = await Promise.all([
    db.stop.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        country: true,
        timezone: true,
        arriveDate: true,
        departDate: true,
        sortOrder: true,
        notes: true,
        lat: true,
        lng: true,
        accommodations: {
          orderBy: { checkIn: "asc" },
          select: {
            id: true,
            stopId: true,
            name: true,
            address: true,
            checkIn: true,
            checkOut: true,
            confirmation: true,
            notes: true,
            lat: true,
            lng: true,
          },
        },
      },
    }),
    db.transport.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        mode: true,
        fromStopId: true,
        toStopId: true,
        depPlace: true,
        depAt: true,
        arrPlace: true,
        arrAt: true,
        reference: true,
        notes: true,
        sortOrder: true,
      },
    }),
  ]);

  if (stops.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="No stops yet"
        description="Add your first stop to start building your itinerary — where are you headed?"
        action={
          <ItineraryManager
            tripId={tripId}
            initialStops={[]}
            initialTransports={[]}
          />
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ItineraryManager
        tripId={tripId}
        initialStops={stops}
        initialTransports={transports.map((t) => ({
          ...t,
          mode: t.mode as TransportMode,
        }))}
      />
    </div>
  );
}
