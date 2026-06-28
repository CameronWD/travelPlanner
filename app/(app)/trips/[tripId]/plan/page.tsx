import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { ItineraryManager } from "@/components/trip/itinerary-manager";
import { StopSpreadsheet } from "@/components/discreet/stop-spreadsheet";
import { getDiscreetState } from "@/lib/discreet-server";
import { buildStopSheetRows } from "@/lib/discreet";
import type { TransportMode } from "@/lib/enums";
import type { NoteView } from "@/components/trip/note-thread";
import { haversineKm, estimateDriveMinutes, estimateRoadKm } from "@/lib/geo";

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

export default async function TripPlanPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const { user } = await requireTripAccess(tripId);

  const [trip, stops, transports, allCosts, chapters] = await Promise.all([
    db.trip.findUnique({
      where: { id: tripId },
      select: {
        homeCurrency: true,
        startDate: true,
        endDate: true,
        drivingWindingFactor: true,
        drivingAvgSpeedKph: true,
      },
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
        nights: true,
        pinned: true,
        chapterId: true,
        chapterSortOrder: true,
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
        depLat: true,
        depLng: true,
        arrPlace: true,
        arrAt: true,
        arrLat: true,
        arrLng: true,
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
      where: { tripId },
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

  // Build a coord lookup by stop id so transport leg estimates can fall back
  // to linked stop coordinates when the transport has no typed dep/arr place.
  const stopCoordsById = new Map<string, { lat: number; lng: number }>();
  for (const s of stops) {
    if (s.lat != null && s.lng != null) {
      stopCoordsById.set(s.id, { lat: s.lat, lng: s.lng });
    }
  }

  const tripStartDate = trip?.startDate ?? undefined;
  const tripEndDate = trip?.endDate ?? undefined;

  const { discreet } = await getDiscreetState();
  if (discreet) {
    const costHomeMinorByStopId: Record<string, number> = {};
    for (const s of stops) {
      let sum = 0;
      for (const acc of s.accommodations) {
        for (const c of costsByOwnerId.get(acc.id) ?? []) {
          sum += c.rateToHome ? Math.round(c.estimatedMinor * c.rateToHome) : c.estimatedMinor;
        }
      }
      costHomeMinorByStopId[s.id] = sum;
    }
    const rows = buildStopSheetRows({
      stops: stops.map((s) => ({
        id: s.id, name: s.name, country: s.country,
        arriveDate: s.arriveDate, departDate: s.departDate,
        nights: s.nights, pinned: s.pinned, notes: s.notes,
        accommodations: s.accommodations.map((a) => ({ name: a.name })),
      })),
      transports: transports.map((t) => ({ mode: t.mode, fromStopId: t.fromStopId, toStopId: t.toStopId })),
      costHomeMinorByStopId,
      homeCurrency: trip?.homeCurrency ?? "AUD",
    });
    return (
      <div className="flex flex-col gap-6">
        <StopSpreadsheet tripId={tripId} rows={rows} homeCurrency={trip?.homeCurrency ?? "AUD"} />
      </div>
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
        chapters={chapters}
        initialStops={stops.map((stop) => ({
          ...stop,
          accommodations: stop.accommodations.map((acc) => ({
            ...acc,
            costs: costsByOwnerId.get(acc.id) ?? [],
          })),
        }))}
        initialTransports={transports.map((t) => {
          const hasTimes = t.depAt != null && t.arrAt != null;
          // Resolve coordinates: transport's own dep/arr coords take priority;
          // fall back to the linked stop's coords when the transport has no
          // typed place (so stop-linked legs get estimates the same way the
          // long-driving-day flag does).
          const fromCoord =
            t.depLat != null && t.depLng != null
              ? { lat: t.depLat, lng: t.depLng }
              : t.fromStopId != null
                ? (stopCoordsById.get(t.fromStopId) ?? null)
                : null;
          const toCoord =
            t.arrLat != null && t.arrLng != null
              ? { lat: t.arrLat, lng: t.arrLng }
              : t.toStopId != null
                ? (stopCoordsById.get(t.toStopId) ?? null)
                : null;
          const coords =
            fromCoord != null && toCoord != null
              ? { from: fromCoord, to: toCoord }
              : null;
          const driveEstimate =
            t.mode === "CAR" && !hasTimes && coords
              ? (() => {
                  const km = haversineKm(coords.from, coords.to);
                  return {
                    minutes: Math.round(
                      estimateDriveMinutes(km, {
                        windingFactor: trip?.drivingWindingFactor ?? 1.5,
                        avgSpeedKph: trip?.drivingAvgSpeedKph ?? 80,
                      }),
                    ),
                    roadKm: Math.round(estimateRoadKm(km, trip?.drivingWindingFactor ?? 1.5)),
                  };
                })()
              : null;
          return {
            ...t,
            mode: t.mode as TransportMode,
            costs: costsByOwnerId.get(t.id) ?? [],
            driveEstimate,
          };
        })}
      />
    </div>
  );
}
