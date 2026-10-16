import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireTripAccess, isTripOwnerOrAdmin } from "@/lib/guards";
import { planScope } from "@/lib/plan-scope";
import { readPlan, resolvePlanParam } from "@/lib/plan-reads";
import { orderPlanStops } from "@/lib/plan-order";
import { chapterForStop } from "@/lib/chapters";
import { stopHue } from "@/lib/stop-colours";
import { formatDateRangeCompact, formatNights } from "@/lib/dates";
import { ItineraryManager } from "@/components/trip/itinerary-manager";
import type { TransportMode } from "@/lib/enum-values";
import type { NoteView } from "@/components/trip/note-thread";
import type { AttachmentView } from "@/components/trip/attachment-list";
import { haversineKm, estimateDriveMinutes, estimateRoadKm } from "@/lib/geo";
import { summarizePlan } from "@/lib/plan-overview";
import { resolveTripDeadline } from "@/lib/trip-deadline";
import { VariantBanner } from "@/components/trip/variant-banner";
import { groupScheduledItemsByStop } from "@/lib/stop-days";
import { itemPhotoUrl } from "@/lib/item-photo";
import { titlesByDate } from "@/lib/day-titles";
import { readRemindersAbout } from "@/lib/reminder-reads";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { isAiConfigured } from "@/lib/ai";
import { tripTodayISO } from "@/lib/trip-today";
import { homeMapPoint } from "@/lib/route-map";
import { planHeaderMeta, tripEyebrow } from "@/lib/plan/plan-model";
import { defaultOpenStops } from "@/lib/plan/plan-hash";
import { PageHeader } from "@/components/ui/page-header";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";
import { PlanBody } from "@/components/plan/plan-body";
import { FitTile } from "@/components/plan/fit-tile";
import { JumpList, type JumpListStop } from "@/components/plan/jump-list";
import { PlanMapButton } from "@/components/plan/plan-mini-map";
import { PlanRiseIn } from "@/components/plan/plan-rise-in";
import {
  PlanAddStopButton,
  PlanFitStrip,
  PlanHeaderActions,
  PlanMobileExtras,
} from "@/components/plan/plan-header-actions";

export const metadata: Metadata = { title: "Plan" };

/**
 * A Booking import reads the booking in one Server Action on this page,
 * measured at up to ~20 s; Vercel Hobby's default without Fluid compute is
 * 10 s, which would cut it off as "busy" after a paid call. A page-level
 * maxDuration covers every Server Action used on the page (Next 16 docs,
 * route-segment-config/maxDuration). docs/DEPLOY.md "Enabling AI".
 */
export const maxDuration = 60;

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

  // Plan variants off (spec B3) → `?plan=` is ignored and this is the real
  // plan; a Fork id that is not this Trip's falls back to it too.
  const { plan: activeForkId, fork: activeFork } = await resolvePlanParam(tripId, plan);
  // The Plan's rows, read once with this viewer's Surprises applied (ADR 0072).
  const rows = await readPlan(tripId, user.id, activeForkId);
  const v = rows.visibility;

  // The page's own (non-Plan) reads in ONE wave once the Plan is known (spec 2026-10-06 §C).
  const [allAttachments, allNotes, dayTitleRows, remindersAbout] = await Promise.all([
    // All attachments for this trip's entities in one query
    db.attachment.findMany({
      where: {
        tripId,
        targetType: { in: ["STOP", "TRANSPORT", "ACCOMMODATION", "ITEM"] },
        targetId: { not: null },
        ...v.where.attachment,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        filename: true,
        title: true,
        mime: true,
        size: true,
        url: true,
        uploadedById: true,
        createdAt: true,
        targetId: true,
        targetType: true,
      },
    }),
    // Notes for stops, transports, and accommodations in one query
    db.note.findMany({
      where: {
        tripId,
        targetType: { in: ["STOP", "TRANSPORT", "ACCOMMODATION"] },
        ...v.where.note,
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
    }),
    // Selected through the Stop so they don't wait for `stops` (spec 2026-10-06 §C).
    db.dayTitle.findMany({
      where: { stop: { tripId, ...planScope(activeForkId) }, ...v.where.dayTitle },
      select: { stopId: true, dayIndex: true, title: true },
    }),
    // Every Reminder about a Stop, Item or leg, any date, grouped by the thing (spec F8).
    readRemindersAbout(tripId, v),
  ]);

  const trip = rows.trip;
  const slug = trip.slug ?? tripId;
  const members = trip.members.map((m) => m.user);
  const chapters = rows.chapters;
  const transports = rows.transports;

  // Hidden Stops keep their shell (name, dates, nights, legs) with notes
  // blanked; every Stop and Item carries its Surprise view for the badge
  // (both done by readPlan). The Stop cards want their Accommodations nested,
  // in check-in order (readPlan's own order).
  const stops = rows.stops.map((s) => ({
    ...s,
    accommodations: rows.accommodations.filter((a) => a.stopId === s.id),
  }));
  // Things to do: a Stop, no date (ADR 0022). A hidden Item's placeholder only
  // ever shows on its date and time, so undated placeholders stay out.
  const hiddenRootItems = new Set(v.hiddenRootItemIds);
  const thingsToDoWithSurprise = rows.items.filter((i) => i.stopId && !i.date && !hiddenRootItems.has(i.id));
  // Day rows: a Stop and a date — visible Items plus this Plan's placeholders
  // titled "Surprise" on their date and time.
  const scheduledItems = rows.items.filter((i) => i.stopId && i.date);
  // readPlan's Costs are unfiltered (hidden Costs stay in totals); the cards
  // render Cost lines, so a hidden owner's Costs are dropped here (ADR 0072).
  const hiddenOwners = new Set(v.hiddenOwnerIds);
  const allCosts = rows.costs.filter(
    (c) => ["TRANSPORT", "ACCOMMODATION", "ITEM"].includes(c.ownerType) && c.ownerId && !hiddenOwners.has(c.ownerId),
  );

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
      title: att.title,
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

  // One cost read (spec 2026-10-06 §C): Transport and Accommodation costs by
  // owner for the entity cards; ITEM costs only for this Plan's things to do
  // and day rows — the same Items the old `ownerId: { in: planItemIds }` read
  // selected (ADR 0022).
  const planItemIds = new Set([...thingsToDoWithSurprise, ...scheduledItems].map((i) => i.id));
  const costsByOwnerId = new Map<string, typeof allCosts>();
  const thingsToDoItemCostsById = new Map<string, typeof allCosts>();
  for (const cost of allCosts) {
    if (!cost.ownerId) continue;
    const target = cost.ownerType === "ITEM" ? thingsToDoItemCostsById : costsByOwnerId;
    if (cost.ownerType === "ITEM" && !planItemIds.has(cost.ownerId)) continue;
    const existing = target.get(cost.ownerId) ?? [];
    existing.push(cost);
    target.set(cost.ownerId, existing);
  }

  // CONTEXT.md "Item photo" (spec §I) — resolve each thing-to-do/scheduled
  // Item's photoUrl once, from the same `photoAttachmentId` the DB already
  // returned above; `photoAttachmentId` itself stays out of the shapes handed
  // to the client (the plan components only ever see `photoUrl`).
  const thingsToDoItemsWithPhoto = thingsToDoWithSurprise.map(({ photoAttachmentId, ...rest }) => ({
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
  // the client plan components without a Map.
  const dayTitles = Object.fromEntries(
    titlesByDate(
      stops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })),
      dayTitleRows,
    ),
  );

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

  // ADR 0068: the plan's deadline — its dated return leg (from the last Stop in
  // plan order, this plan's own legs) else the Trip's hard end date.
  const planDeadline = resolveTripDeadline({
    stops: ordered,
    transports,
    hardEndDate: trip?.hardEndDate ?? null,
    roundTrip: trip?.roundTrip ?? true,
  });

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
    deadline: planDeadline,
  });

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
  const chaptersEnabled = trip?.chaptersEnabled ?? true;

  return (
    <PlanBody initialOpen={initialOpen} today={today}>
      <div className="flex flex-col gap-5">
        {activeFork && <VariantBanner tripId={tripId} variantName={activeFork.name} />}
        {/* MOTION.md P1: header 0, then the rail's map 60, Fit 120, jump list 180ms. */}
        <PlanRiseIn index={0}>
          <PageHeader
            eyebrow={tripEyebrow(trip?.name ?? "", trip?.startDate ?? null)}
            title="Plan"
            meta={planHeaderMeta(planSummary, trip?.startDate ?? null, trip?.endDate ?? null)}
            actions={<PlanHeaderActions tripId={tripId} forkId={activeForkId} chaptersEnabled={chaptersEnabled} aiConfigured={aiConfigured} />}
            mobileAction={<PlanAddStopButton variant="round" />}
            trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
          />
        </PlanRiseIn>
        {stops.length > 0 && (
          <div className="lg:hidden">
            <PlanFitStrip summary={planSummary} stops={mapStops} home={home} />
          </div>
        )}
        <div className={stops.length > 0 ? PLAN_GRID_CLASS : "flex flex-col"}>
          <div className="flex min-w-0 flex-col gap-4">
            <ItineraryManager
              tripId={tripId}
              isOwner={isOwner}
              homeCurrency={trip?.homeCurrency}
              homeBaseName={trip?.homeName}
              homeTimezone={trip?.homeTimezone}
              roundTrip={trip?.roundTrip}
              forkId={activeForkId}
              tripStartDate={tripStartDate}
              tripEndDate={tripEndDate}
              hardEndDate={planDeadline?.date ?? null}
              notesByStopId={notesByStopId}
              notesByTransportId={notesByTransportId}
              notesByAccommodationId={notesByAccommodationId}
              attachmentsByStopId={attachmentsByStopId}
              attachmentsByTransportId={attachmentsByTransportId}
              attachmentsByAccommodationId={attachmentsByAccommodationId}
              attachmentsByItemId={attachmentsByItemId}
              currentUserId={user.id}
              members={members}
              chapters={trip?.chaptersEnabled ? chapters : []}
              chaptersEnabled={chaptersEnabled}
              thingsToDoByStopId={thingsToDoByStopId}
              dayItemsByStopId={dayItemsByStopId}
              dayTitles={dayTitles}
              remindersByStopId={remindersAbout.byStopId}
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
            <PlanMobileExtras tripId={tripId} forkId={activeForkId} chaptersEnabled={chaptersEnabled} aiConfigured={aiConfigured} />
          </div>
          {stops.length > 0 && (
            <aside aria-label="Plan overview" className={PLAN_ASIDE_CLASS}>
              {/* empty:hidden — the Route map button renders nothing under two located stops, and an empty slot would still take a gap. */}
              <PlanRiseIn delayMs={60} className="empty:hidden">
                <PlanMapButton stops={mapStops} home={home} />
              </PlanRiseIn>
              <PlanRiseIn delayMs={120}>
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
              </PlanRiseIn>
              <PlanRiseIn delayMs={180}>
                <JumpList stops={planStopsNavStops} chapters={planStopsNavChapters} homeBase={planStopsNavHomeBase} />
              </PlanRiseIn>
            </aside>
          )}
        </div>
      </div>
    </PlanBody>
  );
}
