import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { isAiConfigured } from "@/lib/ai";
import { WishlistBoard } from "@/components/trip/wishlist-board";
import type { ItemCardItem } from "@/components/trip/item-card";
import type { CostRow } from "@/server/actions/costs";
import type { NoteView } from "@/components/trip/note-thread";
import type { VoteView } from "@/components/trip/vote-control";

export default async function WishlistPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  const { user } = await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      homeCurrency: true,
      stops: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          arriveDate: true,
          departDate: true,
        },
      },
      items: {
        where: { forkId: null, date: null }, // UNSCHEDULED items only
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
          stop: {
            select: { name: true },
          },
        },
      },
    },
  });

  if (!trip) {
    notFound();
  }

  const itemIds = trip.items.map((i) => i.id);

  // Fetch ITEM costs, notes, and votes in parallel
  const [itemCosts, itemNotes, itemVotes] = await Promise.all([
    itemIds.length > 0
      ? db.cost.findMany({
          where: {
            forkId: null,
            ownerType: "ITEM",
            ownerId: { in: itemIds },
          },
          orderBy: { createdAt: "asc" },
          select: {
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
              select: { id: true, name: true, image: true },
            },
          },
        })
      : Promise.resolve([] as Array<{
          id: string;
          body: string;
          createdAt: Date;
          targetId: string;
          author: { id: string; name: string | null; image: string | null };
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
              select: { name: true, image: true },
            },
          },
        })
      : Promise.resolve([] as Array<{
          itemId: string;
          userId: string;
          level: string;
          user: { name: string | null; image: string | null };
        }>),
  ]);

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
  }));

  return (
    <WishlistBoard
      tripId={trip.id}
      tripStartDate={trip.startDate}
      stops={trip.stops}
      items={items}
      costsByItemId={costsByItemId}
      homeCurrency={trip.homeCurrency}
      notesByItemId={notesByItemId}
      votesByItemId={votesByItemId}
      currentUserId={user.id}
      aiConfigured={isAiConfigured()}
    />
  );
}
