import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { requireTripAccess } from "@/lib/guards";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { tripEyebrow } from "@/lib/plan/plan-model";
import { buildItinerary } from "@/lib/itinerary";
import { loadDayTitles } from "@/lib/day-titles-loader";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CalendarViews, CalendarViewSwitch } from "@/components/trip/calendar-views";
import { PageHeader } from "@/components/ui/page-header";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";
import type { TransportMode } from "@/lib/enum-values";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);
  const slug = await tripSlugFor(tripId);

  // Policy (not a BND-2 spelling exemption): this dated view deliberately
  // always shows the real plan and ignores `?plan=` — see
  // architecture-sitrep-2026-09-22.md. Never wire in a variable plan here.

  // Fetch the trip dates + all relevant data
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { name: true, startDate: true, endDate: true },
  });
  if (!trip) notFound();

  const [stops, items, transports, accommodations, wishlistItems] = await Promise.all([
    db.stop.findMany({
      // Rough (date-less) stops have no place on a dated calendar.
      where: { tripId, ...REAL_PLAN, arriveDate: { not: null } },
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
      where: { tripId, ...REAL_PLAN, date: { not: null } },
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
        hiddenFromShares: true,
      },
    }),
    db.transport.findMany({
      where: { tripId, ...REAL_PLAN },
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
      where: { tripId, ...REAL_PLAN },
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
      },
    }),
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, date: null, stopId: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, category: true, stopId: true },
    }),
  ]);

  const eyebrow = tripEyebrow(trip.name, trip.startDate);
  const hasDates = Boolean(trip.startDate && trip.endDate);
  const hasCalendar = hasDates && stops.length > 0;

  // Graceful empty state — no stops, or a date-less trip, means there is no
  // dated calendar to project. Kit copy: states.jsx `Days`.
  let body: React.ReactNode;
  if (!hasDates) {
    body = (
      <EmptyState
        icon={CalendarDays}
        tone="sun"
        title="No dates yet"
        description="Pick when you leave to lay your stops across the calendar."
        action={
          <Button asChild>
            <Link href={tripPath(slug, "/settings")}>
              <CalendarDays aria-hidden="true" />
              Set dates
            </Link>
          </Button>
        }
      />
    );
  } else if (stops.length === 0) {
    body = (
      <EmptyState
        icon={MapPin}
        tone="teal"
        title="No stops yet"
        description="Add the first place you’re going and it lands on the calendar."
        action={
          <Button asChild>
            {/* `?add=stop` is the Plan page's existing open-the-add-stop-sheet param
                (ItineraryManager reads it via useSearchParams and strips it). */}
            <Link href={tripPath(slug, "/plan?add=stop")}>
              <Plus aria-hidden="true" />
              Add a stop
            </Link>
          </Button>
        }
      />
    );
  } else {
    const itinerary = buildItinerary({
      startDate: trip.startDate!,
      endDate: trip.endDate!,
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
        hiddenFromShares: item.hiddenFromShares,
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
        checkInTime: a.checkInTime,
        checkOutTime: a.checkOutTime,
        confirmation: a.confirmation,
        notes: a.notes,
      })),
    });

    const agendaToday = todayISOInZone(currentTripTimezone(stops));

    // Day titles (CONTEXT.md "Day title", Task 5, spec §H) — shown under the
    // date on both the agenda and month views, truncated; not in the Calendar
    // feed. `stops` above is already dated + real-plan scoped.
    const dayTitles = Object.fromEntries(
      await loadDayTitles(
        stops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })),
      ),
    );

    body = (
      <CalendarViews
        tripId={tripId}
        days={itinerary}
        tripStart={trip.startDate!}
        tripEnd={trip.endDate!}
        wishlistItems={wishlistItems}
        todayISO={agendaToday}
        dayTitles={dayTitles}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={eyebrow}
        title="Calendar"
        actions={hasCalendar ? <CalendarViewSwitch /> : undefined}
        trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
      />
      {hasCalendar && (
        // PageHeader hides `actions` below md (controller ruling, Task 22) —
        // this phone-only copy keeps the Month/Agenda switch reachable there.
        // Both copies read/write the same module-level store (calendar-views.tsx),
        // so they always agree without any prop threading between them.
        <div className="md:hidden" data-slot="calendar-mobile-view-switch">
          <CalendarViewSwitch />
        </div>
      )}
      {body}
    </div>
  );
}
