import { notFound } from "next/navigation";
import { BookOpen, CalendarDays } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { formatLongDate } from "@/lib/dates";
import { buildItinerary } from "@/lib/itinerary";
import { EmptyState } from "@/components/ui/empty-state";
import { Timeline } from "@/components/trip/timeline";
import { DayNav } from "@/components/trip/day-nav";
import { AddItemButton } from "@/components/trip/item-form-dialog";
import { JournalEditor } from "@/components/trip/journal-editor";
import type { TransportMode } from "@/lib/enums";

export default async function DayPage({
  params,
}: {
  params: Promise<{ tripId: string; date: string }>;
}) {
  const { tripId, date } = await params;
  await requireTripAccess(tripId);

  // Validate date param format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    notFound();
  }

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { startDate: true, endDate: true },
  });
  if (!trip) notFound();
  // A date-less trip has no dated day pages.
  if (!trip.startDate || !trip.endDate) notFound();

  // Allow a small buffer (2 days) so links from nearby days still work gracefully
  const BUFFER = 2;
  const bufferStart = adjustDate(trip.startDate, -BUFFER);
  const bufferEnd = adjustDate(trip.endDate, BUFFER);
  if (date < bufferStart || date > bufferEnd) {
    notFound();
  }

  // Clamp the date to the real trip range for rendering
  const effectiveDate =
    date < trip.startDate
      ? trip.startDate
      : date > trip.endDate
        ? trip.endDate
        : date;

  const [stops, items, transports, accommodations, journalEntry, journalPhotos] =
    await Promise.all([
      db.stop.findMany({
        // Rough (date-less) stops don't appear on a dated day view.
        where: { tripId, arriveDate: { not: null } },
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
        where: { tripId, date: { not: null } },
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
        where: { tripId },
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
        where: { tripId },
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
      db.journalEntry.findUnique({
        where: { tripId_date: { tripId, date: effectiveDate } },
        select: {
          id: true,
          body: true,
          updatedAt: true,
          author: { select: { id: true, name: true, image: true } },
        },
      }),
      db.attachment.findMany({
        where: { tripId, targetType: "JOURNAL", targetId: effectiveDate },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          filename: true,
          mime: true,
          size: true,
          url: true,
          uploadedById: true,
          createdAt: true,
        },
      }),
    ]);

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

  const dayPlan = itinerary.find((d) => d.dateISO === effectiveDate);
  if (!dayPlan) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Day not found"
        description="This date doesn't appear to fall within your trip range."
      />
    );
  }

  const stopOptions = stops.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="flex flex-col gap-6">
      {/* Day header */}
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold text-foreground">
          {formatLongDate(effectiveDate)}
        </h2>
        {dayPlan.stop && (
          <p className="text-sm text-muted-foreground">
            {dayPlan.stop.name}
            {dayPlan.stop.country ? `, ${dayPlan.stop.country}` : ""}
          </p>
        )}
      </div>

      {/* Prev / Next navigation */}
      <DayNav
        tripId={tripId}
        currentDate={effectiveDate}
        startDate={trip.startDate}
        endDate={trip.endDate}
      />

      {/* Detailed timeline */}
      <div className="rounded-xl border border-border bg-card px-4 py-4">
        <Timeline day={dayPlan} variant="day" />
      </div>

      {/* Quick add */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Add something to this day</p>
        <AddItemButton
          tripId={tripId}
          stops={stopOptions}
          tripStartDate={effectiveDate}
          defaultUnscheduled={false}
          label="Add to this day"
        />
      </div>

      {/* Journal */}
      <section aria-labelledby="journal-heading">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="size-4 text-primary" aria-hidden />
          <h3
            id="journal-heading"
            className="font-display text-lg font-semibold text-foreground"
          >
            Journal
          </h3>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-4">
          <JournalEditor
            tripId={tripId}
            date={effectiveDate}
            initialBody={journalEntry?.body ?? ""}
            updatedAt={journalEntry?.updatedAt ?? null}
            author={journalEntry?.author ?? null}
            photos={journalPhotos}
          />
        </div>
      </section>
    </div>
  );
}

/**
 * Add or subtract days from a YYYY-MM-DD string.
 * Tiny inline helper to avoid extra imports.
 */
function adjustDate(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
