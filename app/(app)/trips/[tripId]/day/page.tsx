import { redirect } from "next/navigation";
import { requireTripAccess } from "@/lib/guards";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { readTripShell } from "@/lib/trip-shell-reads";
import { tripTodayISO } from "@/lib/trip-today";
import { defaultDayISO } from "@/lib/day-view-default";

/**
 * /trips/:id/day → the default day (spec decision 3); date-less → Plan. The
 * Days nav links straight at the default day (ADR 0063, DaysHrefProvider), so
 * this is only reached by deep links and bookmarks.
 */
export default async function DayIndexPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  await requireTripAccess(tripId);
  const slug = await tripSlugFor(tripId);
  const trip = await readTripShell(tripId);
  if (!trip) redirect(tripPath(slug));
  const date = defaultDayISO({ startDate: trip.startDate, endDate: trip.endDate, today: tripTodayISO(trip.stops) });
  redirect(date ? tripPath(slug, `/day/${date}`) : tripPath(slug, "/plan"));
}
