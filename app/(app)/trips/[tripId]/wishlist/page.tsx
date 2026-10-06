import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { resolvePlan, REAL_PLAN, planScope } from "@/lib/plan-scope";
import { isAiConfigured } from "@/lib/ai";
import { WishlistBoard } from "@/components/trip/wishlist-board";
import { WishlistHeaderActions } from "@/components/trip/wishlist-header-actions";
import { VariantBanner } from "@/components/trip/variant-banner";
import { getUserGlobe } from "@/lib/globe";
import { suggestMarkersForTrip } from "@/lib/globe-suggestions";
import type { MarkerView } from "@/components/globe/types";
import type { ItemCardItem } from "@/components/trip/item-card";
import type { CostRow } from "@/server/actions/costs";
import type { NoteView } from "@/components/trip/note-thread";
import type { VoteView } from "@/components/trip/vote-control";
import { TRAVELLER_SELECT, type TravellerLike } from "@/lib/traveller";
import { itemPhotoUrl } from "@/lib/item-photo";
import { tripEyebrow } from "@/lib/plan/plan-model";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { PageHeader } from "@/components/ui/page-header";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";

export const metadata: Metadata = { title: "Wishlist" };

export default async function WishlistPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ plan?: string | string[] }>;
}) {
  const { tripId } = await params;
  const { plan } = await searchParams;

  const { user } = await requireTripAccess(tripId);

  // Wave 1 (spec 2026-10-06 §C): the Trip with its ideas, the slug and the
  // viewer's Globe markers — none depends on another. The markers chain on
  // the Globe membership.
  const globePromise = getUserGlobe(user.id);
  const [trip, slug, globe, globeMarkerRows] = await Promise.all([
    db.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        homeCurrency: true,
        forksEnabled: true,
        stops: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            arriveDate: true,
            departDate: true,
            country: true,
            countryCode: true,
            lat: true,
            lng: true,
          },
        },
        items: {
          where: { ...REAL_PLAN, date: null, stopId: null }, // Wishlist ideas only (ADR 0022)
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
            sourceMarkerId: true,
            hiddenFromShares: true,
            photoAttachmentId: true,
            stop: {
              select: { name: true },
            },
          },
        },
      },
    }),
    tripSlugFor(tripId),
    globePromise,
    globePromise.then((g) =>
      g
        ? db.marker.findMany({
            where: { globeId: g.id },
            orderBy: { createdAt: "desc" },
            select: {
              id: true, title: true, category: true, note: true, link: true, timing: true,
              lat: true, lng: true, city: true, country: true, countryCode: true,
            },
          })
        : [],
    ),
  ]);

  if (!trip) {
    notFound();
  }
  const globeMarkers: MarkerView[] = globeMarkerRows;

  // Plan variants off (spec B3) → `?plan=` is ignored and this is the real plan.
  // Otherwise validate the fork exists for this trip; fall back to real plan if not.
  const selectedForkId = resolvePlan({ plan, forksEnabled: trip.forksEnabled });
  const activeFork = selectedForkId
    ? await db.fork.findFirst({ where: { id: selectedForkId, tripId }, select: { id: true, name: true } })
    : null;
  const activeForkId = activeFork ? activeFork.id : null;

  // Markers already pulled into THIS trip's wishlist (dedupe scope = unscheduled ideas,
  // which is exactly what trip.items already filters to).
  const addedMarkerIds = trip.items
    .map((i) => i.sourceMarkerId)
    .filter((id): id is string => id !== null);

  const suggestedMarkers = suggestMarkersForTrip({
    markers: globeMarkers,
    stops: trip.stops.map((s) => ({ countryCode: s.countryCode, lat: s.lat, lng: s.lng })),
    addedMarkerIds,
  });

  const itemIds = trip.items.map((i) => i.id);

  // CONTEXT.md "Item photo" (spec §I) — only the Attachments Wishlist ideas
  // actually point at, not every Attachment on the trip.
  const photoAttachmentIds = trip.items
    .map((i) => i.photoAttachmentId)
    .filter((id): id is string => id !== null);

  // Wave 2: the current Plan's Stops, plus ITEM costs, notes, votes,
  // active-plan placements AND photo Attachments.
  const [planStops, itemCosts, itemNotes, itemVotes, activePlacements, photoAttachments] = await Promise.all([
    // Spec 2026-10-05 §E: Schedule offers the CURRENT Plan's days — a Fork's
    // own Stops while one is active. `trip.stops` above is every Plan's.
    db.stop.findMany({
      where: { tripId, ...planScope(activeForkId) },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, lat: true, lng: true, arriveDate: true, departDate: true },
    }),
    itemIds.length > 0
      ? db.cost.findMany({
          where: {
            ...REAL_PLAN,
            ownerType: "ITEM",
            ownerId: { in: itemIds },
          },
          orderBy: { createdAt: "asc" },
          select: {
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
          },
        })
      : Promise.resolve([] as CostRow[]),

    itemIds.length > 0
      ? db.note.findMany({
          where: {
            tripId,
            targetType: "ITEM",
            targetId: { in: itemIds },
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            body: true,
            createdAt: true,
            targetId: true,
            author: {
              select: TRAVELLER_SELECT,
            },
          },
        })
      : Promise.resolve([] as Array<{
          id: string;
          body: string;
          createdAt: Date;
          targetId: string;
          author: TravellerLike;
        }>),

    itemIds.length > 0
      ? db.vote.findMany({
          where: {
            tripId,
            itemId: { in: itemIds },
          },
          select: {
            itemId: true,
            userId: true,
            level: true,
            user: {
              select: TRAVELLER_SELECT,
            },
          },
        })
      : Promise.resolve([] as Array<{
          itemId: string;
          userId: string;
          level: string;
          user: TravellerLike;
        }>),

    // Placements: idea ids that already have a scheduled copy in the active plan.
    // Only a Fork affordance ("in this plan") reads them — skip when forks are off.
    trip.forksEnabled && itemIds.length > 0
      ? db.item.findMany({
          where: {
            tripId,
            forkId: activeForkId,
            sourceItemId: { in: itemIds },
          },
          select: { sourceItemId: true },
        })
      : Promise.resolve([] as Array<{ sourceItemId: string | null }>),

    photoAttachmentIds.length > 0
      ? db.attachment.findMany({
          where: { id: { in: photoAttachmentIds } },
          select: { id: true, url: true },
        })
      : Promise.resolve([] as Array<{ id: string; url: string }>),
  ]);

  // Keyed by the Attachment's OWN id (== an Item's `photoAttachmentId`), not
  // its targetId — `lib/item-photo.ts`'s `itemPhotoUrl` resolves leniently.
  const attachmentsById = new Map(photoAttachments.map((a) => [a.id, { url: a.url }]));

  // Group costs by itemId
  const costsByItemId = new Map<string, CostRow[]>();
  for (const cost of itemCosts) {
    if (!cost.ownerId) continue;
    const existing = costsByItemId.get(cost.ownerId) ?? [];
    existing.push(cost);
    costsByItemId.set(cost.ownerId, existing);
  }

  // Group notes by targetId (= itemId)
  const notesByItemId = new Map<string, NoteView[]>();
  for (const note of itemNotes) {
    const existing = notesByItemId.get(note.targetId) ?? [];
    existing.push({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt,
      author: note.author,
    });
    notesByItemId.set(note.targetId, existing);
  }

  // Group votes by itemId
  const votesByItemId = new Map<string, VoteView[]>();
  for (const vote of itemVotes) {
    const existing = votesByItemId.get(vote.itemId) ?? [];
    existing.push({
      userId: vote.userId,
      level: vote.level as VoteView["level"],
      user: vote.user,
    });
    votesByItemId.set(vote.itemId, existing);
  }

  // Idea ids that already have a scheduled copy in the active plan
  const placedIdeaIds = activePlacements
    .map((p) => p.sourceItemId)
    .filter((id): id is string => id !== null);

  // Shape items for the board: resolve stop name
  const items: ItemCardItem[] = trip.items.map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    date: item.date,
    startTime: item.startTime,
    endTime: item.endTime,
    address: item.address,
    link: item.link,
    booking: item.booking,
    notes: item.notes,
    stopId: item.stopId,
    stopName: item.stop?.name ?? null,
    lat: item.lat,
    lng: item.lng,
    hiddenFromShares: item.hiddenFromShares,
    photoUrl: itemPhotoUrl(item, attachmentsById),
  }));

  return (
    <div className="flex flex-col gap-6">
      {activeFork && <VariantBanner tripId={trip.id} variantName={activeFork.name} />}
      <PageHeader
        eyebrow={tripEyebrow(trip.name, trip.startDate)}
        title="Wishlist"
        meta={items.length ? `${items.length} idea${items.length === 1 ? "" : "s"}` : undefined}
        actions={
          <WishlistHeaderActions
            tripId={trip.id}
            stops={trip.stops}
            tripStartDate={trip.startDate}
            homeCurrency={trip.homeCurrency}
            hasGlobe={globe !== null}
            globeMarkers={globeMarkers}
            addedMarkerIds={addedMarkerIds}
            showAdd={items.length > 0}
          />
        }
        trailing={<TripHeaderTrailing tripId={trip.id} slug={slug} />}
      />
      {globe !== null && (
        <div className="md:hidden">
          {/* "Add from Globe" is hidden below md inside PageHeader's `actions`
              (AUDIT.md's controller ruling) — this phone-only copy keeps it
              reachable there. `showAdd={false}`: "Add an idea" already has a
              mobile-reachable copy inside WishlistBoard itself. */}
          <WishlistHeaderActions
            tripId={trip.id}
            stops={trip.stops}
            tripStartDate={trip.startDate}
            homeCurrency={trip.homeCurrency}
            hasGlobe
            globeMarkers={globeMarkers}
            addedMarkerIds={addedMarkerIds}
            showAdd={false}
          />
        </div>
      )}
      <WishlistBoard
        tripId={trip.id}
        tripStartDate={trip.startDate}
        stops={trip.stops}
        planStops={planStops}
        items={items}
        costsByItemId={costsByItemId}
        homeCurrency={trip.homeCurrency}
        notesByItemId={notesByItemId}
        votesByItemId={votesByItemId}
        currentUserId={user.id}
        aiConfigured={isAiConfigured()}
        activeForkId={activeForkId}
        placedIdeaIds={placedIdeaIds}
        forksEnabled={trip.forksEnabled}
        hasGlobe={globe !== null}
        globeMarkers={globeMarkers}
        addedMarkerIds={addedMarkerIds}
        suggestedMarkers={suggestedMarkers}
      />
    </div>
  );
}
