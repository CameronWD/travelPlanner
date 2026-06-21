import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { WishlistBoard } from "@/components/trip/wishlist-board";
import type { ItemCardItem } from "@/components/trip/item-card";
import type { CostRow } from "@/server/actions/costs";

export default async function WishlistPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  await requireTripAccess(tripId);

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
        where: { date: null }, // UNSCHEDULED items only
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

  // Fetch ITEM costs for wishlist items
  const itemIds = trip.items.map((i) => i.id);
  const itemCosts: CostRow[] = itemIds.length > 0
    ? await db.cost.findMany({
        where: {
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
    : [];

  // Group by itemId
  const costsByItemId = new Map<string, CostRow[]>();
  for (const cost of itemCosts) {
    if (!cost.ownerId) continue;
    const existing = costsByItemId.get(cost.ownerId) ?? [];
    existing.push(cost);
    costsByItemId.set(cost.ownerId, existing);
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
  }));

  return (
    <WishlistBoard
      tripId={trip.id}
      tripStartDate={trip.startDate}
      stops={trip.stops}
      items={items}
      costsByItemId={costsByItemId}
      homeCurrency={trip.homeCurrency}
    />
  );
}
