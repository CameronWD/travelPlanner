import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { buildItinerary } from "@/lib/itinerary";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarViews } from "@/components/trip/calendar-views";
import type { TransportMode } from "@/lib/enums";

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  // Fetch the trip dates + all relevant data
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { startDate: true, endDate: true },
  });
  if (!trip) notFound();

  const [stops, items, transports, accommodations, wishlistItems] = await Promise.all([
    db.stop.findMany({
      // Rough (date-less) stops have no place on a dated calendar.
      where: { tripId, forkId: null, arriveDate: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        country: true,
        timezone: true,
        arriveDate: true,
        departDate: true,
        sortOrder: true,
      },
    }),
    db.item.findMany({
      where: { tripId, forkId: null, date: { not: null } },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        title: true,
        category: true,
        date: true,
        startTime: true,
        endTime: true,
        stopId: true,
        address: true,
        link: true,
        booking: true,
        notes: true,
      },
    }),
    db.transport.findMany({
      where: { tripId, forkId: null },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        mode: true,
        fromStopId: true,
        toStopId: true,
        depPlace: true,
        arrPlace: true,
        depAt: true,
        arrAt: true,
        reference: true,
        notes: true,
      },
    }),
    db.accommodation.findMany({
      where: { tripId, forkId: null },
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
      },
    }),
    db.item.findMany({
      where: { tripId, forkId: null, date: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, category: true, stopId: true },
    }),
  ]);

  // Graceful empty state — no stops, or a date-less trip, means there is no
  // dated calendar to project.
  if (!trip.startDate || !trip.endDate) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No dates yet"
        description="Set your trip's start and end dates to see a day-by-day calendar."
        action={
          <Link
            href={`/trips/${tripId}/plan`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <MapPin className="size-4" aria-hidden="true" />
            Go to Plan
          </Link>
        }
      />
    );
  }
  if (stops.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No Stops yet"
        description="Add Stops on the Plan page to start building your day-by-day calendar."
        action={
          <Link
            href={`/trips/${tripId}/plan`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <MapPin className="size-4" aria-hidden="true" />
            Go to Plan
          </Link>
        }
      />
    );
  }

  const itinerary = buildItinerary({
    startDate: trip.startDate,
    endDate: trip.endDate,
    // Non-null at runtime: the query filters rough (date-less) stops out.
    stops: stops.map((s) => ({
      id: s.id,
      name: s.name,
      country: s.country,
      timezone: s.timezone ?? "UTC",
      arriveDate: s.arriveDate!,
      departDate: s.departDate!,
      sortOrder: s.sortOrder,
    })),
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      stopId: item.stopId,
      address: item.address,
      link: item.link,
      booking: item.booking,
      notes: item.notes,
    })),
    transports: transports.map((t) => ({
      id: t.id,
      mode: t.mode as TransportMode,
      fromStopId: t.fromStopId,
      toStopId: t.toStopId,
      depPlace: t.depPlace,
      arrPlace: t.arrPlace,
      depAt: t.depAt,
      arrAt: t.arrAt,
      reference: t.reference,
      notes: t.notes,
    })),
    accommodations: accommodations.map((a) => ({
      id: a.id,
      stopId: a.stopId,
      name: a.name,
      address: a.address,
      checkIn: a.checkIn,
      checkOut: a.checkOut,
      confirmation: a.confirmation,
      notes: a.notes,
    })),
  });

  return (
    <CalendarViews
      tripId={tripId}
      days={itinerary}
      tripStart={trip.startDate}
      tripEnd={trip.endDate}
      wishlistItems={wishlistItems}
    />
  );
}
