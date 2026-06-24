import { MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { EmptyState } from "@/components/ui/empty-state";
import { ItineraryManager } from "@/components/trip/itinerary-manager";
import type { TransportMode } from "@/lib/enums";
import type { NoteView } from "@/components/trip/note-thread";

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
  const { user } = await requireTripAccess(tripId);

  const [trip, stops, transports, allCosts, chapters] = await Promise.all([
    db.trip.findUnique({
      where: { id: tripId },
      select: { homeCurrency: true, startDate: true, endDate: true },
    }),
    db.stop.findMany({
      // Rough (date-less) stops are invisible to this dated view; a later task
      // surfaces them on the brainstorm canvas.
      where: { tripId, arriveDate: { not: null } },
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
    db.chapter.findMany({
      // Only dated chapters group the dated itinerary; rough chapters are
      // surfaced by a later task.
      where: { tripId, startDate: { not: null } },
      orderBy: { startDate: "asc" },
      select: { id: true, name: true, colour: true, startDate: true, endDate: true },
    }),
  ]);

  // Fetch stop notes
  const stopIds = stops.map((s) => s.id);
  const stopNotes =
    stopIds.length > 0
      ? await db.note.findMany({
          where: {
            tripId,
            targetType: "STOP",
            targetId: { in: stopIds },
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            body: true,
            createdAt: true,
            targetId: true,
            author: {
              select: { id: true, name: true, image: true },
            },
          },
        })
      : [];

  // Group stop notes by stopId
  const notesByStopId = new Map<string, NoteView[]>();
  for (const note of stopNotes) {
    const existing = notesByStopId.get(note.targetId) ?? [];
    existing.push({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt,
      author: note.author,
    });
    notesByStopId.set(note.targetId, existing);
  }

  // Group costs by ownerId for quick lookup
  const costsByOwnerId = new Map<string, typeof allCosts>();
  for (const cost of allCosts) {
    if (!cost.ownerId) continue;
    const existing = costsByOwnerId.get(cost.ownerId) ?? [];
    existing.push(cost);
    costsByOwnerId.set(cost.ownerId, existing);
  }

  // The stop/chapter queries filter rough rows out (arriveDate/startDate not
  // null), so these are non-null at runtime; narrow the Prisma types for the
  // dated ItineraryManager props.
  const datedChapters = chapters.map((c) => ({
    ...c,
    startDate: c.startDate!,
    endDate: c.endDate!,
  }));
  const tripStartDate = trip?.startDate ?? undefined;
  const tripEndDate = trip?.endDate ?? undefined;

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
            chapters={datedChapters}
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
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
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        notesByStopId={notesByStopId}
        currentUserId={user.id}
        chapters={datedChapters}
        initialStops={stops.map((stop) => ({
          ...stop,
          // Non-null at runtime: the query filters rough (date-less) stops out.
          timezone: stop.timezone ?? "UTC",
          arriveDate: stop.arriveDate!,
          departDate: stop.departDate!,
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
