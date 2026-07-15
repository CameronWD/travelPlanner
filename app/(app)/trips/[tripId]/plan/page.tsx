import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { planScope } from "@/lib/plan-scope";
import { ItineraryManager } from "@/components/trip/itinerary-manager";
import type { TransportMode } from "@/lib/enums";
import type { NoteView } from "@/components/trip/note-thread";
import type { AttachmentView } from "@/components/trip/attachment-list";
import { haversineKm, estimateDriveMinutes, estimateRoadKm } from "@/lib/geo";
import { PlanOverview } from "@/components/trip/plan-overview";
import { summarizePlan } from "@/lib/plan-overview";
import { VariantBanner } from "@/components/trip/variant-banner";

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
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const { tripId } = await params;
  const { plan } = await searchParams;
  const selectedForkId = plan ?? null;

  const { user } = await requireTripAccess(tripId);

  // Validate the fork exists for this trip; fall back to real plan if not.
  const activeFork = selectedForkId
    ? await db.fork.findFirst({ where: { id: selectedForkId, tripId }, select: { id: true, name: true } })
    : null;
  const activeForkId = activeFork ? activeFork.id : null;

  const [trip, stops, transports, allCosts, chapters, thingsToDoItems] = await Promise.all([
    db.trip.findUnique({
      where: { id: tripId },
      select: {
        homeCurrency: true,
        homeName: true,
        homeCountryCode: true,
        roundTrip: true,
        startDate: true,
        endDate: true,
        hardEndDate: true,
        drivingWindingFactor: true,
        drivingAvgSpeedKph: true,
      },
    }),
    db.stop.findMany({
      where: { tripId, ...planScope(activeForkId) },
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
      where: { tripId, ...planScope(activeForkId) },
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
        ...planScope(activeForkId),
        ownerType: { in: ["TRANSPORT", "ACCOMMODATION"] },
        ownerId: { not: null },
      },
      orderBy: { createdAt: "asc" },
      select: COST_SELECT,
    }),
    db.chapter.findMany({
      where: { tripId, ...planScope(activeForkId) },
      orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, colour: true, startDate: true, endDate: true, sortOrder: true },
    }),
    // Per-stop things to do: plan-owned items with stopId set and date null (ADR 0022)
    db.item.findMany({
      where: { tripId, ...planScope(activeForkId), stopId: { not: null }, date: null },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        title: true,
        category: true,
        date: true,
        startTime: true,
        endTime: true,
        address: true,
        link: true,
        booking: true,
        notes: true,
        stopId: true,
        lat: true,
        lng: true,
      },
    }),
  ]);

  // Fetch all attachments for this trip's entities in one query
  const allAttachments = await db.attachment.findMany({
    where: {
      tripId,
      targetType: { in: ["STOP", "TRANSPORT", "ACCOMMODATION", "ITEM"] },
      targetId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      filename: true,
      mime: true,
      size: true,
      url: true,
      uploadedById: true,
      createdAt: true,
      targetId: true,
      targetType: true,
    },
  });

  // Group attachments by targetId for quick lookup
  const attachmentsByStopId = new Map<string, AttachmentView[]>();
  const attachmentsByTransportId = new Map<string, AttachmentView[]>();
  const attachmentsByAccommodationId = new Map<string, AttachmentView[]>();
  const attachmentsByItemId = new Map<string, AttachmentView[]>();

  for (const att of allAttachments) {
    if (!att.targetId) continue;
    const attView: AttachmentView = {
      id: att.id,
      filename: att.filename,
      mime: att.mime,
      size: att.size,
      url: att.url,
      uploadedById: att.uploadedById,
      createdAt: att.createdAt,
    };
    if (att.targetType === "STOP") {
      const existing = attachmentsByStopId.get(att.targetId) ?? [];
      existing.push(attView);
      attachmentsByStopId.set(att.targetId, existing);
    } else if (att.targetType === "TRANSPORT") {
      const existing = attachmentsByTransportId.get(att.targetId) ?? [];
      existing.push(attView);
      attachmentsByTransportId.set(att.targetId, existing);
    } else if (att.targetType === "ACCOMMODATION") {
      const existing = attachmentsByAccommodationId.get(att.targetId) ?? [];
      existing.push(attView);
      attachmentsByAccommodationId.set(att.targetId, existing);
    } else if (att.targetType === "ITEM") {
      const existing = attachmentsByItemId.get(att.targetId) ?? [];
      existing.push(attView);
      attachmentsByItemId.set(att.targetId, existing);
    }
  }

  // Fetch notes for stops, transports, and accommodations in one query
  const allNotes = await db.note.findMany({
    where: {
      tripId,
      targetType: { in: ["STOP", "TRANSPORT", "ACCOMMODATION"] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      createdAt: true,
      targetId: true,
      targetType: true,
      author: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  // Group notes by targetType then targetId
  const notesByStopId = new Map<string, NoteView[]>();
  const notesByTransportId = new Map<string, NoteView[]>();
  const notesByAccommodationId = new Map<string, NoteView[]>();

  for (const note of allNotes) {
    const noteView: NoteView = {
      id: note.id,
      body: note.body,
      createdAt: note.createdAt,
      author: note.author,
    };
    if (note.targetType === "STOP") {
      const existing = notesByStopId.get(note.targetId) ?? [];
      existing.push(noteView);
      notesByStopId.set(note.targetId, existing);
    } else if (note.targetType === "TRANSPORT") {
      const existing = notesByTransportId.get(note.targetId) ?? [];
      existing.push(noteView);
      notesByTransportId.set(note.targetId, existing);
    } else if (note.targetType === "ACCOMMODATION") {
      const existing = notesByAccommodationId.get(note.targetId) ?? [];
      existing.push(noteView);
      notesByAccommodationId.set(note.targetId, existing);
    }
  }

  // Group costs by ownerId for quick lookup
  const costsByOwnerId = new Map<string, typeof allCosts>();
  for (const cost of allCosts) {
    if (!cost.ownerId) continue;
    const existing = costsByOwnerId.get(cost.ownerId) ?? [];
    existing.push(cost);
    costsByOwnerId.set(cost.ownerId, existing);
  }

  // Fetch costs for things-to-do items (ADR 0022)
  const thingsToDoItemIds = thingsToDoItems.map((i) => i.id);
  const thingsToDoItemCostsRaw =
    thingsToDoItemIds.length > 0
      ? await db.cost.findMany({
          where: {
            tripId,
            ...planScope(activeForkId),
            ownerType: "ITEM",
            ownerId: { in: thingsToDoItemIds },
          },
          orderBy: { createdAt: "asc" },
          select: COST_SELECT,
        })
      : [];

  // Group things-to-do costs by item id
  const thingsToDoItemCostsById = new Map<string, typeof thingsToDoItemCostsRaw>();
  for (const cost of thingsToDoItemCostsRaw) {
    if (!cost.ownerId) continue;
    const existing = thingsToDoItemCostsById.get(cost.ownerId) ?? [];
    existing.push(cost);
    thingsToDoItemCostsById.set(cost.ownerId, existing);
  }

  // Group things-to-do items by stopId
  const thingsToDoByStopId = new Map<string, typeof thingsToDoItems>();
  for (const item of thingsToDoItems) {
    if (!item.stopId) continue;
    const existing = thingsToDoByStopId.get(item.stopId) ?? [];
    existing.push(item);
    thingsToDoByStopId.set(item.stopId, existing);
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

  const planSummary = summarizePlan({
    stops: stops.map((s) => ({
      id: s.id,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
      nights: s.nights,
      pinned: s.pinned,
      sortOrder: s.sortOrder,
    })),
    startDate: trip?.startDate ?? null,
    hardEndDate: trip?.hardEndDate ?? null,
  });

  return (
    <div className="flex flex-col gap-6">
      {activeFork && <VariantBanner tripId={tripId} variantName={activeFork.name} />}
      {/* Bold Modular desktop (D3): itinerary editor in the main column, plan overview
          in a right rail. DOM order (overview → itinerary) keeps the overview on top on
          mobile; lg:order swaps them so the editor is the 1fr main column on desktop. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {stops.length > 0 && (
          <div className="flex flex-col gap-6 lg:order-2">
            <PlanOverview
              tripId={tripId}
              summary={planSummary}
              startDate={trip?.startDate ?? null}
              fitStops={stops.map((s) => ({
                id: s.id, name: s.name, arriveDate: s.arriveDate, departDate: s.departDate,
                nights: s.nights, pinned: s.pinned, sortOrder: s.sortOrder,
              }))}
            />
          </div>
        )}
        <div className="flex flex-col gap-6 lg:order-1">
          <ItineraryManager
            tripId={tripId}
            homeCurrency={trip?.homeCurrency}
            homeBaseName={trip?.homeName}
            homeCountryCode={trip?.homeCountryCode}
            roundTrip={trip?.roundTrip}
            forkId={activeForkId}
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
            notesByStopId={notesByStopId}
            notesByTransportId={notesByTransportId}
            notesByAccommodationId={notesByAccommodationId}
            attachmentsByStopId={attachmentsByStopId}
            attachmentsByTransportId={attachmentsByTransportId}
            attachmentsByAccommodationId={attachmentsByAccommodationId}
            attachmentsByItemId={attachmentsByItemId}
            currentUserId={user.id}
            chapters={chapters}
            thingsToDoByStopId={thingsToDoByStopId}
            thingsToDoItemCostsById={thingsToDoItemCostsById}
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
      </div>
    </div>
  );
}
