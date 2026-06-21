import { MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { EmptyState } from "@/components/ui/empty-state";
import { ItineraryManager } from "@/components/trip/itinerary-manager";
import type { TransportMode } from "@/lib/enums";

const COST_SELECT = {
  id: true,
  estimatedMinor: true,
  actualMinor: true,
  currency: true,
  rateToHome: true,
  paidAt: true,
  ownerType: true,
  ownerId: true,
  label: true,
  category: true,
} as const;

export default async function TripOverviewPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  const [trip, stops, transports, allCosts] = await Promise.all([
    db.trip.findUnique({
      where: { id: tripId },
      select: { homeCurrency: true },
    }),
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
    // Fetch all entity-attached costs for this trip in one query
    db.cost.findMany({
      where: {
        tripId,
        ownerType: { in: ["TRANSPORT", "ACCOMMODATION"] },
        ownerId: { not: null },
      },
      orderBy: { createdAt: "asc" },
      select: COST_SELECT,
    }),
  ]);

  // Group costs by ownerId for quick lookup
  const costsByOwnerId = new Map<string, typeof allCosts>();
  for (const cost of allCosts) {
    if (!cost.ownerId) continue;
    const existing = costsByOwnerId.get(cost.ownerId) ?? [];
    existing.push(cost);
    costsByOwnerId.set(cost.ownerId, existing);
  }

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
        homeCurrency={trip?.homeCurrency}
        initialStops={stops.map((stop) => ({
          ...stop,
          accommodations: stop.accommodations.map((acc) => ({
            ...acc,
            costs: costsByOwnerId.get(acc.id) ?? [],
          })),
        }))}
        initialTransports={transports.map((t) => ({
          ...t,
          mode: t.mode as TransportMode,
          costs: costsByOwnerId.get(t.id) ?? [],
        }))}
      />
    </div>
  );
}
