import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { requireTripAccess } from "@/lib/guards";
import { tripTodayISO } from "@/lib/trip-today";
import { defaultDayISO } from "@/lib/day-view-default";

/** /trips/:id/day → the default day (spec decision 3); date-less → Plan. */
export default async function DayIndexPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  await requireTripAccess(tripId);
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      startDate: true,
      endDate: true,
      stops: {
        where: { ...REAL_PLAN, arriveDate: { not: null } },
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true, timezone: true, arriveDate: true, departDate: true },
      },
    },
  });
  if (!trip) redirect(`/trips/${tripId}`);
  const date = defaultDayISO({ startDate: trip.startDate, endDate: trip.endDate, today: tripTodayISO(trip.stops) });
  redirect(date ? `/trips/${tripId}/day/${date}` : `/trips/${tripId}/plan`);
}
