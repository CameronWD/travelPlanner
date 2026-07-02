import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { planScope } from "@/lib/plan-scope";
import { ItineraryManager } from "@/components/trip/itinerary-manager";
import { StopSpreadsheet } from "@/components/discreet/stop-spreadsheet";
import { getDiscreetState } from "@/lib/discreet-server";
import { buildStopSheetRows } from "@/lib/discreet";
import type { TransportMode } from "@/lib/enums";
import type { NoteView } from "@/components/trip/note-thread";
import { haversineKm, estimateDriveMinutes, estimateRoadKm } from "@/lib/geo";
import { convertMinor } from "@/lib/money";
import { DEFAULT_HOME_CURRENCY } from "@/lib/currencies";
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

  const [trip, stops, transports, allCosts, chapters] = await Promise.all([
    db.trip.findUnique({
      where: { id: tripId },
      select: {
        homeCurrency: true,
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
    const home = trip?.homeCurrency ?? DEFAULT_HOME_CURRENCY;
    const costHomeMinorByStopId: Record<string, number> = {};
    for (const s of stops) {
      let sum = 0;
      for (const acc of s.accommodations) {
        for (const c of costsByOwnerId.get(acc.id) ?? []) {
          // Use the canonical FX path so non-2-decimal currencies convert correctly.
          sum += c.rateToHome
            ? convertMinor(c.estimatedMinor, c.currency, home, c.rateToHome)
            : c.estimatedMinor;
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
      homeCurrency: home,
    });
    return (
      <div className="flex flex-col gap-6">
        <StopSpreadsheet tripId={tripId} rows={rows} homeCurrency={home} />
      </div>
    );
  }

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
      {/* Discreet mode returns the stop-spreadsheet view earlier in this function and
          never reaches this branch, so the variant banner cannot leak fork vocabulary. */}
      {activeFork && <VariantBanner tripId={tripId} variantName={activeFork.name} />}
      {stops.length > 0 && (
        <PlanOverview
          tripId={tripId}
          summary={planSummary}
          startDate={trip?.startDate ?? null}
          fitStops={stops.map((s) => ({
            id: s.id, name: s.name, arriveDate: s.arriveDate, departDate: s.departDate,
            nights: s.nights, pinned: s.pinned, sortOrder: s.sortOrder,
          }))}
        />
      )}
      <ItineraryManager
        tripId={tripId}
        homeCurrency={trip?.homeCurrency}
        forkId={activeForkId}
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
