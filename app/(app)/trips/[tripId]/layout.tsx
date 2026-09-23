import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { requireTripAccess } from "@/lib/guards";
import { formatDateRange } from "@/lib/dates";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
import { tripOfflinePaths } from "@/lib/offline";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TripNav } from "@/components/trip/trip-nav";
import { MobileTabBar } from "@/components/trip/mobile-tab-bar";
import { NotificationBell } from "@/components/trip/notification-bell";
import { ForkSwitcher } from "@/components/trip/fork-switcher";
import { OfflineWarmer } from "@/components/offline-warmer";
import { FeedbackTripMarker } from "@/components/feedback/feedback-trip-marker";
import {
  getUnreadActivityCount,
  getRecentActivity,
} from "@/server/actions/activity";
import { listForks } from "@/server/actions/forks";
import { computeTripPhase } from "@/lib/trip-phase";

function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  // Guard: 404 for non-members
  await requireTripAccess(tripId);

  // Policy (not a BND-2 spelling exemption): this dated view deliberately
  // always shows the real plan and ignores `?plan=` — see
  // architecture-sitrep-2026-09-22.md. Never wire in a variable plan here.

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      homeCurrency: true,
      members: {
        select: {
          user: {
            select: { id: true, name: true, image: true },
          },
        },
      },
      stops: {
        where: { ...REAL_PLAN, arriveDate: { not: null } },
        orderBy: { sortOrder: "asc" },
        select: { timezone: true, arriveDate: true, departDate: true },
      },
    },
  });

  if (!trip) {
    notFound();
  }

  const [unreadCount, recent, forks, warmAttachments] = await Promise.all([
    getUnreadActivityCount(tripId),
    getRecentActivity(tripId, 10),
    listForks(tripId),
    db.attachment.findMany({
      where: { tripId },
      select: { url: true, size: true },
    }),
  ]);

  const today = todayISOInZone(currentTripTimezone(trip.stops));
  const tripPhase = computeTripPhase({
    startDate: trip.startDate,
    endDate: trip.endDate,
    today,
  });

  // Forking is allowed in sketching / planning / final-prep (not travelling/past)
  const showForkSwitcher = tripPhase !== "travelling" && tripPhase !== "past";

  // A date-less trip shows a placeholder instead of a range.
  const dateRange =
    trip.startDate && trip.endDate
      ? formatDateRange(trip.startDate, trip.endDate)
      : "No dates yet";

  const offlinePaths = tripOfflinePaths(tripId, trip.startDate, trip.endDate, warmAttachments);

  return (
    // md+: the rail (TripNav → Dock) sits left of the header+content column,
    // matching the desktop kit's Shell. Below md the rail is hidden (Dock's
    // own "hidden ... md:flex") and MobileTabBar takes over instead.
    <div className="flex flex-col gap-0 md:flex-row">
      <TripNav tripId={tripId} />

      <div className="flex min-w-0 flex-1 flex-col gap-0">
        {/* ── Trip header ── */}
        <div className="pb-4 pt-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-2xl sm:text-3xl font-semibold leading-tight tracking-tight text-foreground break-words">
                {trip.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{dateRange}</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {trip.homeCurrency}
                </Badge>
              </div>
            </div>

            {/* Member avatars + fork switcher + notification bell */}
            <div className="flex items-center gap-2">
              {trip.members.length > 0 && (
                <div className="flex -space-x-2" aria-label="Trip members">
                  {trip.members.slice(0, 6).map(({ user }) => (
                    <Avatar
                      key={user.id}
                      className="size-8 ring-2 ring-background"
                      title={user.name ?? undefined}
                    >
                      {user.image ? (
                        <AvatarImage src={user.image} alt={user.name ?? "Member"} />
                      ) : null}
                      <AvatarFallback className="text-xs">
                        {initials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {trip.members.length > 6 && (
                    <div className="flex size-8 items-center justify-center rounded-full bg-muted ring-2 ring-background text-xs font-medium text-muted-foreground">
                      +{trip.members.length - 6}
                    </div>
                  )}
                </div>
              )}
              {showForkSwitcher && (
                <ForkSwitcher
                  tripId={tripId}
                  forks={forks}
                  phase={tripPhase}
                />
              )}
              <NotificationBell
                tripId={tripId}
                unreadCount={unreadCount}
                recent={recent}
              />
            </div>
          </div>
        </div>

        {/* ── Page content ── */}
        <div className="py-6 pb-[calc(var(--tp-tab-bar-h)+1rem+env(safe-area-inset-bottom))] md:pb-6">
          <OfflineWarmer paths={offlinePaths} />
          <FeedbackTripMarker tripId={tripId} tripName={trip.name} />
          {children}
        </div>
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <MobileTabBar tripId={tripId} />
    </div>
  );
}
