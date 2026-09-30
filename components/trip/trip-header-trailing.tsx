import { readTripShell, readUnreadActivityCount, readRecentActivity, readForks } from "@/lib/trip-shell-reads";
import { tripTodayISO } from "@/lib/trip-today";
import { computeTripPhase } from "@/lib/trip-phase";
import { ForkSwitcher } from "@/components/trip/fork-switcher";
import { NotificationBell } from "@/components/trip/notification-bell";
import { TripSwitcherFromContext } from "@/components/shell/trip-switcher";

/**
 * What the trip layout's header carried beside the name, for PageHeader's
 * trailing slot (spec §A): the compact switcher pill (768–1279px; the sidebar
 * card takes over from xl), the fork switcher exactly when the layout shows
 * it, and the bell. Reads are request-cached, so the layout's own copies are
 * free on a cold load.
 */
export async function TripHeaderTrailing({ tripId }: { tripId: string; slug: string }) {
  const trip = await readTripShell(tripId);
  if (!trip) return null;
  const phase = computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today: tripTodayISO(trip.stops) });
  const showForkSwitcher = trip.forksEnabled && phase !== "travelling" && phase !== "past";
  const [unreadCount, recent, forks] = await Promise.all([
    readUnreadActivityCount(tripId),
    readRecentActivity(tripId, 10),
    showForkSwitcher ? readForks(tripId) : Promise.resolve([]),
  ]);
  return (
    <div data-slot="trip-header-trailing" className="flex items-center gap-2">
      <div className="hidden md:flex xl:hidden">
        <TripSwitcherFromContext tripId={tripId} fallbackName={trip.name} variant="pill" />
      </div>
      {showForkSwitcher ? <ForkSwitcher tripId={tripId} forks={forks} phase={phase} /> : null}
      <NotificationBell tripId={tripId} unreadCount={unreadCount} recent={recent} />
    </div>
  );
}
