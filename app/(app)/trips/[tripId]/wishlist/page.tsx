import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { WishlistBoard } from "@/components/trip/wishlist-board";
import type { ItemCardItem } from "@/components/trip/item-card";

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
    />
  );
}
