import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireTripAccess, isTripOwnerOrAdmin } from "@/lib/guards";
import { planScope, THINGS_TO_DO_WHERE, resolvePlan } from "@/lib/plan-scope";
import { orderPlanStops } from "@/lib/plan-order";
import { chapterForStop } from "@/lib/chapters";
import { stopHue } from "@/lib/stop-colours";
import { formatDateRangeCompact, formatNights } from "@/lib/dates";
import { ItineraryManager } from "@/components/trip/itinerary-manager";
import type { TransportMode } from "@/lib/enums";
import type { NoteView } from "@/components/trip/note-thread";
import type { AttachmentView } from "@/components/trip/attachment-list";
import { haversineKm, estimateDriveMinutes, estimateRoadKm } from "@/lib/geo";
import { summarizePlan } from "@/lib/plan-overview";
import { VariantBanner } from "@/components/trip/variant-banner";
import { groupScheduledItemsByStop } from "@/lib/stop-days";
import { itemPhotoUrl } from "@/lib/item-photo";
import { loadDayTitles } from "@/lib/day-titles-loader";
import type { ReminderItem } from "@/server/actions/reminders";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { isAiConfigured } from "@/lib/ai";
import { tripTodayISO } from "@/lib/trip-today";
import { homeMapPoint } from "@/lib/route-map";
import { planHeaderMeta, routeCentroid, tripEyebrow } from "@/lib/plan/plan-model";
import { defaultOpenStops } from "@/lib/plan/plan-hash";
import { PageHeader } from "@/components/ui/page-header";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";
import { PlanBody } from "@/components/plan/plan-body";
import { FitTile } from "@/components/plan/fit-tile";
import { JumpList, type JumpListStop } from "@/components/plan/jump-list";
import { PlanMiniMap } from "@/components/plan/plan-mini-map";
import {
  PlanAddStopButton,
  PlanFitStrip,
  PlanHeaderActions,
  PlanMobileExtras,
} from "@/components/plan/plan-header-actions";

export const metadata: Metadata = { title: "Plan" };

/** The list's 1fr column beside the rail: 280px at lg, 320px from xl (PLAN.md §1.2). */
export const PLAN_GRID_CLASS =
  "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start xl:grid-cols-[minmax(0,1fr)_320px]";

/**
 * The rail (desktop only; mobile has the Fit strip): pinned near the viewport
 * top (no app top bar from md up, so no header offset) and capped to the
 * viewport so its own scroll never outgrows the window.
 */
export const PLAN_ASIDE_CLASS =
  "hidden lg:sticky lg:top-6 lg:flex lg:max-h-[calc(100dvh-3rem)] lg:flex-col lg:gap-4 lg:overflow-y-auto";

/** Home further than this from the route's centre is left off the mini map (LA-042). */
export const FAR_HOME_KM = 1500;

const COST_SELECT = {
  id: true,
  costMinor: true,
  paidMinor: true,
  currency: true,
  rateToHome: true,
  paidAt: true,
  dueDate: true,
  ownerType: true,
  ownerId: true,
  label: true,
  category: true,
  settlement: true,
} as const;

export default async function TripPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ plan?: string | string[] }>;
}) {
  const { tripId } = await params;
  const { plan } = await searchParams;

  const { user, membership } = await requireTripAccess(tripId);
  // ARCH-DAT-1b: deleting a Stop is owner-only — this drives whether the
  // delete control renders at all (deleteStop's own gate is the real check).
  const isOwner = isTripOwnerOrAdmin(membership, user.email);

  // Plan variants off (spec B3) → `?plan=` is ignored and this is the real plan.
  const forkGate = await db.trip.findUnique({ where: { id: tripId }, select: { forksEnabled: true } });
  const selectedForkId = resolvePlan({ plan, forksEnabled: forkGate?.forksEnabled ?? false });

  // Validate the fork exists for this trip; fall back to real plan if not.
  const activeFork = selectedForkId
    ? await db.fork.findFirst({ where: { id: selectedForkId, tripId }, select: { id: true, name: true } })
    : null;
  const activeForkId = activeFork ? activeFork.id : null;

  const [trip, stops, transports, allCosts, chapters, thingsToDoItems, scheduledItems] = await Promise.all([
    db.trip.findUnique({
      where: { id: tripId },
      select: {
        name: true,
        homeLat: true,
        homeLng: true,
        homeCurrency: true,
        homeName: true,
        homeCountryCode: true,
        roundTrip: true,
        startDate: true,
        endDate: true,
        hardEndDate: true,
        drivingWindingFactor: true,
        drivingAvgSpeedKph: true,
        chaptersEnabled: true,
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
            checkInTime: true,
            checkOutTime: true,
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
        anchorStopId: true,
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
      where: { tripId, ...planScope(activeForkId), ...THINGS_TO_DO_WHERE },
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
        hiddenFromShares: true,
        photoAttachmentId: true,
      },
    }),
    // Per-stop scheduled items: plan-owned items with stopId set and a date —
    // the stop's slice of the Timeline, rendered as day rows (grilling 2026-09-13)
    db.item.findMany({
      where: { tripId, ...planScope(activeForkId), stopId: { not: null }, date: { not: null } },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
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
        hiddenFromShares: true,
        photoAttachmentId: true,
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

  // CONTEXT.md "Item photo" (spec §I): resolved leniently via
  // `lib/item-photo.ts`'s `itemPhotoUrl`, keyed by the Attachment's OWN id
  // (not its targetId — that's what `attachmentsByItemId` below is for).
  const attachmentsById = new Map(allAttachments.map((a) => [a.id, { url: a.url }]));

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
        select: TRAVELLER_SELECT,
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

  // Fetch costs for things-to-do items (ADR 0022) and scheduled items (day rows)
  const planItemIds = [...thingsToDoItems, ...scheduledItems].map((i) => i.id);
  const thingsToDoItemCostsRaw =
    planItemIds.length > 0
      ? await db.cost.findMany({
          where: {
            tripId,
            ...planScope(activeForkId),
            ownerType: "ITEM",
            ownerId: { in: planItemIds },
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

  // CONTEXT.md "Item photo" (spec §I) — resolve each thing-to-do/scheduled
  // Item's photoUrl once, from the same `photoAttachmentId` the DB already
  // returned above; `photoAttachmentId` itself stays out of the shapes handed
  // to the client (StopCard/StopDayList only ever see `photoUrl`).
  const thingsToDoItemsWithPhoto = thingsToDoItems.map(({ photoAttachmentId, ...rest }) => ({
    ...rest,
    photoUrl: itemPhotoUrl({ photoAttachmentId }, attachmentsById),
  }));
  const scheduledItemsWithPhoto = scheduledItems.map(({ photoAttachmentId, ...rest }) => ({
    ...rest,
    photoUrl: itemPhotoUrl({ photoAttachmentId }, attachmentsById),
  }));

  // Group things-to-do items by stopId
  const thingsToDoByStopId = new Map<string, typeof thingsToDoItemsWithPhoto>();
  for (const item of thingsToDoItemsWithPhoto) {
    if (!item.stopId) continue;
    const existing = thingsToDoByStopId.get(item.stopId) ?? [];
    existing.push(item);
    thingsToDoByStopId.set(item.stopId, existing);
  }

  // Day rows are grouped by DATE COVERAGE, not by stopId, so a Changeover day
  // shows the same Items under both Stops that claim it (ADR 0049).
  const dayItemsByStopId = groupScheduledItemsByStop(stops, scheduledItemsWithPhoto);

  // Day titles (CONTEXT.md "Day title", Task 5, spec §H) — resolved once per
  // dateISO across the whole plan (a Changeover date carries at most one
  // title, ADR 0049) and passed down as a plain object so it serialises to
  // the client StopDayList without a Map.
  const dayTitles = Object.fromEntries(
    await loadDayTitles(
      stops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })),
    ),
  );

  // Reminders about a Stop (Task 7), grouped for the Stop card's own
  // "Reminders" line. Unlike listRemindersForTrip (the Home card's "upcoming"
  // feed — date-filtered and capped at 20), a Stop's own card shows every
  // Reminder it holds regardless of date, so this queries directly rather
  // than reusing that helper.
  const stopReminders = await db.reminder.findMany({
    where: { tripId, stopId: { not: null } },
    orderBy: { date: "asc" },
    select: { id: true, title: true, date: true, stopId: true },
  });
  const stopNameById = new Map(stops.map((s) => [s.id, s.name]));
  const remindersByStopId = new Map<string, ReminderItem[]>();
  for (const r of stopReminders) {
    if (!r.stopId) continue;
    const existing = remindersByStopId.get(r.stopId) ?? [];
    existing.push({
      id: r.id,
      title: r.title,
      date: r.date,
      stopId: r.stopId,
      stopName: stopNameById.get(r.stopId) ?? null,
    });
    remindersByStopId.set(r.stopId, existing);
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

  // Stops list in the side panel (spec §G, feedback cmuhvbi4h): same plan
  // order and chapter membership as the itinerary editor below it, with each
  // Stop's dates collapsed to a compact label — never a Stop card's own
  // (year-bearing) `formatDateRange`.
  const chaptersForNav = trip?.chaptersEnabled ? chapters : [];
  const ordered = orderPlanStops(stops);
  const planStopsNavStops: JumpListStop[] = ordered.map((stop) => ({
    id: stop.id,
    name: stop.name,
    colourHue: stopHue(stop.sortOrder),
    dateLabel:
      stop.arriveDate && stop.departDate
        ? formatDateRangeCompact(stop.arriveDate, stop.departDate)
        : formatNights(stop.nights ?? 1, { rough: true }),
    chapterId: trip?.chaptersEnabled ? (chapterForStop(stop, chaptersForNav)?.id ?? null) : null,
    rough: !(stop.arriveDate && stop.departDate),
  }));
  const planStopsNavChapters = trip?.chaptersEnabled
    ? chapters.map((c) => ({ id: c.id, name: c.name }))
    : null;
  const planStopsNavHomeBase = trip?.homeName
    ? { name: trip.homeName, roundTrip: trip?.roundTrip ?? false }
    : null;

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

  const slug = await tripSlugFor(tripId);
  const aiConfigured = isAiConfigured();
  const today = tripTodayISO(stops);
  const planCounts = Object.fromEntries(
    [...dayItemsByStopId].map(([id, items]) => [id, items.filter((i) => i.stopId === id).length]),
  );
  const initialOpen = defaultOpenStops(ordered, planCounts, today);
  const mapStops = ordered
    .filter((s) => s.arriveDate && s.departDate)
    .map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      arriveDate: s.arriveDate!,
      departDate: s.departDate!,
      sortOrder: s.sortOrder,
    }));
  const home = trip ? homeMapPoint(trip) : null;
  const centroid = routeCentroid(mapStops);
  const farHome = home && centroid && haversineKm(home, centroid) > FAR_HOME_KM ? { name: home.name } : null;
  const chaptersEnabled = trip?.chaptersEnabled ?? true;

  return (
    <PlanBody initialOpen={initialOpen} today={today}>
      <div className="flex flex-col gap-5">
        {activeFork && <VariantBanner tripId={tripId} variantName={activeFork.name} />}
        <PageHeader
          eyebrow={tripEyebrow(trip?.name ?? "", trip?.startDate ?? null)}
          title="Plan"
          meta={planHeaderMeta(planSummary, trip?.startDate ?? null, trip?.endDate ?? null)}
          actions={<PlanHeaderActions tripId={tripId} chaptersEnabled={chaptersEnabled} aiConfigured={aiConfigured} />}
          mobileAction={<PlanAddStopButton variant="round" />}
          trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
        />
        {stops.length > 0 && (
          <div className="lg:hidden">
            <PlanFitStrip summary={planSummary} stops={mapStops} home={home} />
          </div>
        )}
        <div className={stops.length > 0 ? PLAN_GRID_CLASS : "flex flex-col"}>
          <div className="flex min-w-0 flex-col gap-4">
            <ItineraryManager
              aiConfigured={aiConfigured}
              tripId={tripId}
              isOwner={isOwner}
              homeCurrency={trip?.homeCurrency}
              homeBaseName={trip?.homeName}
              homeCountryCode={trip?.homeCountryCode}
              roundTrip={trip?.roundTrip}
              forkId={activeForkId}
              tripStartDate={tripStartDate}
              tripEndDate={tripEndDate}
              hardEndDate={trip?.hardEndDate ?? null}
              notesByStopId={notesByStopId}
              notesByTransportId={notesByTransportId}
              notesByAccommodationId={notesByAccommodationId}
              attachmentsByStopId={attachmentsByStopId}
              attachmentsByTransportId={attachmentsByTransportId}
              attachmentsByAccommodationId={attachmentsByAccommodationId}
              attachmentsByItemId={attachmentsByItemId}
              currentUserId={user.id}
              chapters={trip?.chaptersEnabled ? chapters : []}
              chaptersEnabled={chaptersEnabled}
              thingsToDoByStopId={thingsToDoByStopId}
              dayItemsByStopId={dayItemsByStopId}
              dayTitles={dayTitles}
              remindersByStopId={remindersByStopId}
              thingsToDoItemCostsById={thingsToDoItemCostsById}
              initialStops={ordered.map((stop) => ({
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
                  anchorStopId: t.anchorStopId,
                  costs: costsByOwnerId.get(t.id) ?? [],
                  driveEstimate,
                };
              })}
            />
            <PlanMobileExtras tripId={tripId} chaptersEnabled={chaptersEnabled} aiConfigured={aiConfigured} />
          </div>
          {stops.length > 0 && (
            <aside aria-label="Plan overview" className={PLAN_ASIDE_CLASS}>
              <PlanMiniMap stops={mapStops} home={home} farHome={farHome} />
              <FitTile
                tripId={tripId}
                isOwner={isOwner}
                summary={planSummary}
                startDate={trip?.startDate ?? null}
                fitStops={stops.map((s) => ({
                  id: s.id, name: s.name, arriveDate: s.arriveDate, departDate: s.departDate,
                  nights: s.nights, pinned: s.pinned, sortOrder: s.sortOrder,
                }))}
              />
              <JumpList stops={planStopsNavStops} chapters={planStopsNavChapters} homeBase={planStopsNavHomeBase} />
            </aside>
          )}
        </div>
      </div>
    </PlanBody>
  );
}
