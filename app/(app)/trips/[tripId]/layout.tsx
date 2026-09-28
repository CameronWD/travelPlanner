import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { formatDateRange } from "@/lib/dates";
import { tripTitle } from "@/lib/page-title";
import { tripTodayISO } from "@/lib/trip-today";
import { defaultDayISO } from "@/lib/day-view-default";
import { tripOfflinePaths } from "@/lib/offline";
import { Badge } from "@/components/ui/badge";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { TripNav } from "@/components/trip/trip-nav";
import { DaysHrefProvider } from "@/components/trip/days-href-context";
import { SectionTransition } from "@/components/navigation/section-transition";
import { TripHeaderFrame } from "@/components/trip/trip-header-frame";
import { SidebarFromContext } from "@/components/shell/sidebar-from-context";
import { TripSwitcherFromContext } from "@/components/shell/trip-switcher";
import { sidebarNavCounts } from "@/components/shell/sidebar-nav-counts";
import { MobileTabBar } from "@/components/trip/mobile-tab-bar";
import { NotificationBell } from "@/components/trip/notification-bell";
import { ForkSwitcher } from "@/components/trip/fork-switcher";
import { OfflineWarmer } from "@/components/offline-warmer";
import { FeedbackTripMarker } from "@/components/feedback/feedback-trip-marker";
import { RememberLastTrip } from "@/components/shell/remember-last-trip";
import { readTripShell, readUnreadActivityCount, readRecentActivity } from "@/lib/trip-shell-reads";
import { listForks } from "@/server/actions/forks";
import { computeTripPhase } from "@/lib/trip-phase";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tripId: string }>;
}): Promise<Metadata> {
  const { tripId } = await params;
  await requireTripAccess(tripId);
  const trip = await readTripShell(tripId);
  if (!trip) return {};
  return { title: tripTitle(trip.name) };
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

  const trip = await readTripShell(tripId);

  if (!trip) {
    notFound();
  }

  const [unreadCount, recent, forks, warmAttachments] = await Promise.all([
    readUnreadActivityCount(tripId),
    readRecentActivity(tripId, 10),
    // Plan variants off (spec B3): no switcher, so no need to list Forks.
    trip.forksEnabled ? listForks(tripId) : Promise.resolve([]),
    db.attachment.findMany({
      where: { tripId },
      select: { url: true, size: true },
    }),
  ]);

  const today = tripTodayISO(trip.stops);
  // The Days tab's one-hop target (ADR 0063). A date-less Trip goes straight
  // to Plan — where day/page.tsx would redirect it — because a link whose
  // server redirect lands on the page already shown (Days tapped on Plan)
  // never changes the URL for the pending state to settle on.
  const defaultDay = defaultDayISO({ startDate: trip.startDate, endDate: trip.endDate, today });
  const daysHref = defaultDay ? `/trips/${tripId}/day/${defaultDay}` : `/trips/${tripId}/plan`;
  const tripPhase = computeTripPhase({
    startDate: trip.startDate,
    endDate: trip.endDate,
    today,
  });

  // Forking is opt-in per trip (spec B3) and allowed in sketching / planning /
  // final-prep (not travelling/past).
  const showForkSwitcher = trip.forksEnabled && tripPhase !== "travelling" && tripPhase !== "past";

  // A date-less trip shows a placeholder instead of a range.
  const dateRange =
    trip.startDate && trip.endDate
      ? formatDateRange(trip.startDate, trip.endDate)
      : "No dates yet";

  const offlinePaths = tripOfflinePaths(tripId, trip.startDate, trip.endDate, warmAttachments);

  return (
    // md–xl: the Dock (TripNav) sits left of the header+content column; xl+:
    // the full Sidebar instead (each hides itself outside its band). Below md
    // both are hidden and MobileTabBar takes over.
    //
    // ADR 0062: data-trip-shell lets app/(app)/layout.tsx's <main> detect a
    // trip page (via the has-[[data-trip-shell]] variant) and go full-bleed,
    // so the rail can sit flush against the viewport's left edge instead of
    // being capped by the app shell's own max-width.
    <DaysHrefProvider href={daysHref}>
      <div data-trip-shell className="flex flex-col gap-0 md:flex-row">
        <TripNav tripId={tripId} />
        <SidebarFromContext
          trip={{ id: trip.id, name: trip.name }}
          switcher={<TripSwitcherFromContext tripId={trip.id} fallbackName={trip.name} variant="card" />}
          counts={sidebarNavCounts(trip.id)}
        />

        <div data-trip-content className="flex min-w-0 flex-1 flex-col px-4 pt-6 sm:px-6 md:px-8">
          <div className="mx-auto flex w-full max-w-page-wide flex-col">
            {/* ── Trip header ── (lg:hidden on Home only — see TripHeaderFrame) */}
            <TripHeaderFrame>
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
                  {/* Compact switcher pill (768–1279px only): the full sidebar
                      (xl+) already carries the switcher, and below md there's no
                      room for it beside the tab bar. */}
                  <div className="hidden md:flex xl:hidden">
                    <TripSwitcherFromContext tripId={trip.id} fallbackName={trip.name} variant="pill" />
                  </div>
                </div>

                {/* Member avatars + fork switcher + notification bell */}
                <div className="flex items-center gap-2">
                  {trip.members.length > 0 && (
                    <Link
                      href={`/trips/${tripId}/settings#travellers`}
                      aria-label={`Trip members (${trip.members.length})`}
                      className="inline-flex min-h-11 items-center rounded-full px-1 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <div className="flex -space-x-2">
                        {trip.members.slice(0, 6).map(({ user }) => (
                          <TravellerAvatar key={user.id} traveller={user} size={32} ring />
                        ))}
                        {trip.members.length > 6 && (
                          <div className="flex size-8 items-center justify-center rounded-full bg-muted ring-2 ring-background text-xs font-medium text-muted-foreground">
                            +{trip.members.length - 6}
                          </div>
                        )}
                      </div>
                    </Link>
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
            </TripHeaderFrame>

            {/* ── Page content ── */}
            <div className="py-6 pb-[calc(var(--tp-tab-bar-h)+1rem+env(safe-area-inset-bottom))] md:pb-6">
              <OfflineWarmer paths={offlinePaths} />
              <FeedbackTripMarker tripId={tripId} tripName={trip.name} />
              <RememberLastTrip tripId={tripId} />
              <SectionTransition>{children}</SectionTransition>
            </div>
          </div>
        </div>

        {/* ── Mobile bottom tab bar ── */}
        <MobileTabBar tripId={tripId} />
      </div>
    </DaysHrefProvider>
  );
}
