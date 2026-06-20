import { MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { EmptyState } from "@/components/ui/empty-state";
import { StopsManager } from "@/components/trip/stops-manager";

export default async function TripOverviewPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  const stops = await db.stop.findMany({
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
    },
  });

  if (stops.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="No stops yet"
        description="Add your first stop to start building your itinerary — where are you headed?"
        action={<StopsManager tripId={tripId} initialStops={[]} />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <StopsManager tripId={tripId} initialStops={stops} />
    </div>
  );
}
