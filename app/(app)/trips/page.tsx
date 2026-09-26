import type { ComponentProps } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PlaneTakeoff } from "lucide-react";
import { requireUser } from "@/lib/guards";
import { WhatsNewBanner } from "@/components/whats-new/whats-new-banner";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cardVariants } from "@/components/ui/card";
import { TripCard } from "@/components/trip/trip-card";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { describePhase, compareForTripList } from "@/lib/trip-phase";
import { todayISO, daysBetween } from "@/lib/dates";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
import { orderPlanStops } from "@/lib/plan-order";
import { loadNextSteps } from "@/lib/next-steps-loader";
import { cn } from "@/lib/cn";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Your trips" };
}

export default async function TripsPage() {
  const user = await requireUser();

  // Policy (not a BND-2 spelling exemption): this dated view deliberately
  // always shows the real plan and ignores `?plan=` — see
  // architecture-sitrep-2026-09-22.md. Never wire in a variable plan here.

  // Fetch trips where the current user is a member, newest first.
  const memberships = await db.tripMember.findMany({
    where: { userId: user.id },
    include: {
      trip: {
        include: {
          _count: { select: { stops: true } },
          stops: {
            where: { ...REAL_PLAN, arriveDate: { not: null } },
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, sortOrder: true, timezone: true, arriveDate: true, departDate: true },
          },
        },
      },
    },
    orderBy: { trip: { createdAt: "desc" } },
  });

  const trips = memberships.map((m) => m.trip);

  const tripIds = trips.map((t) => t.id);

  // Fetch located stops for route-render cover fallback.
  const coverStopsRaw = await db.stop.findMany({
    where: { tripId: { in: tripIds }, ...REAL_PLAN, lat: { not: null }, lng: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, tripId: true, sortOrder: true, arriveDate: true, departDate: true, lat: true, lng: true },
  });
  const rawCoverStopsByTrip = new Map<string, typeof coverStopsRaw>();
  for (const s of coverStopsRaw) {
    const arr = rawCoverStopsByTrip.get(s.tripId) ?? [];
    arr.push(s);
    rawCoverStopsByTrip.set(s.tripId, arr);
  }
  // ADR 0038: a scheduled stop's position IS its dates — the cover map's
  // route order must follow canonical plan order, not raw sortOrder.
  const coverStopsByTrip = new Map<string, { lat: number; lng: number }[]>();
  for (const [tId, tripStops] of rawCoverStopsByTrip) {
    coverStopsByTrip.set(
      tId,
      orderPlanStops(tripStops).map((s) => ({ lat: s.lat as number, lng: s.lng as number })),
    );
  }

  // Build cover key map per trip from the memberships query already in hand.
  const coverKeyByTrip = new Map(trips.map((t) => [t.id, t.coverImageKey]));

  // Build a map of tripId → lastReadActivityAt for the current user.
  const membershipByTripId = new Map(
    memberships.map((m) => [m.tripId, m.lastReadActivityAt]),
  );

  // Count unread activity per trip (activities created by others, after the marker).
  const unreadCounts = await Promise.all(
    trips.map((trip) => {
      const marker = membershipByTripId.get(trip.id) ?? null;
      return db.activity.count({
        where: {
          tripId: trip.id,
          actorId: { not: user.id },
          ...(marker ? { createdAt: { gt: marker } } : {}),
        },
      });
    }),
  );

  const unreadByTrip: Record<string, number> = {};
  trips.forEach((trip, i) => {
    unreadByTrip[trip.id] = unreadCounts[i];
  });

  const today = todayISO();
  // Canonical plan order for the "current timezone" pick — t.stops is fetched
  // by sortOrder, which no longer tracks date order under ADR 0038.
  const todayByTripId = new Map(
    trips.map((t) => [t.id, todayISOInZone(currentTripTimezone(orderPlanStops(t.stops)))]),
  );
  const sorted = [...trips].sort((a, b) => compareForTripList(a, b, today, todayByTripId));

  // Featured card's "next step" — the same Next steps a Traveller sees on
  // that trip's Home (lib/next-steps-loader.ts's `loadNextSteps`, shared with
  // components/trip/home/phase-planning.tsx so the two can't drift apart).
  // One extra query set, for the one featured trip only.
  const featuredTrip = sorted[0];
  const featuredNextSteps = featuredTrip
    ? await loadNextSteps(featuredTrip.id, todayByTripId.get(featuredTrip.id) ?? today)
    : [];
  const featuredNextStep = featuredNextSteps[0]?.title ?? null;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">
          Your trips
        </h1>
        <Button asChild>
          <Link href="/trips/new">New trip</Link>
        </Button>
      </div>

      <WhatsNewBanner />

      {/* Trips grid / empty state */}
      {trips.length === 0 ? (
        <EmptyState
          icon={PlaneTakeoff}
          title="No trips yet"
          description="Create your first trip and start planning your next adventure together."
          action={
            <div className="flex flex-col items-center gap-2">
              <Button asChild>
                <Link href="/trips/new">New trip</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/help">New here? How to use Teepee</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <AnimatedList className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-5" staggerOnMount>
          {sorted.map((trip, idx) => {
            const featured = idx === 0;
            const phase = describePhase({ startDate: trip.startDate, endDate: trip.endDate, today: todayByTripId.get(trip.id) ?? today });

            // Featured card only: a richer "Next up" — route summary (first
            // Stop → last Stop) and Stops/nights from the same canonical
            // plan order used for the cover render; `nextStep` is the title
            // of that trip's first real Next step (loaded above via
            // loadNextSteps), or null when there isn't one — never a
            // restatement of the countdown already shown beside it.
            let featuredDetails: ComponentProps<typeof TripCard>["featuredDetails"];
            if (featured) {
              const orderedStops = orderPlanStops(trip.stops);
              const firstStop = orderedStops[0];
              const lastStop = orderedStops[orderedStops.length - 1];
              const routeSummary =
                orderedStops.length === 0
                  ? ""
                  : firstStop.id === lastStop.id
                    ? firstStop.name
                    : `${firstStop.name} → ${lastStop.name}`;
              const nights = trip.startDate && trip.endDate ? daysBetween(trip.startDate, trip.endDate) : null;
              const stopsAndNights =
                `${trip._count.stops === 1 ? "1 stop" : `${trip._count.stops} stops`}` +
                (nights != null ? ` · ${nights === 1 ? "1 night" : `${nights} nights`}` : "");
              featuredDetails = {
                countdown: phase.countdownValue,
                unit: phase.countdownUnit,
                routeSummary,
                stopsAndNights,
                nextStep: featuredNextStep,
              };
            }

            return (
              <AnimatedItem key={trip.id} index={idx} className={cn("h-full", featured && "col-span-2")}>
                <TripCard
                  id={trip.id}
                  name={trip.name}
                  startDate={trip.startDate}
                  endDate={trip.endDate}
                  stopCount={trip._count.stops}
                  phase={phase}
                  unreadCount={unreadByTrip[trip.id] ?? 0}
                  hasCover={(coverKeyByTrip.get(trip.id) ?? null) != null}
                  coverVersion={coverKeyByTrip.get(trip.id) ?? null}
                  focalX={trip.coverFocalX}
                  focalY={trip.coverFocalY}
                  coverStops={coverStopsByTrip.get(trip.id) ?? []}
                  home={trip.homeLat != null && trip.homeLng != null ? { lat: trip.homeLat, lng: trip.homeLng } : null}
                  roundTrip={trip.roundTrip ?? false}
                  featured={featured}
                  featuredDetails={featuredDetails}
                />
              </AnimatedItem>
            );
          })}
          {/* Kit's dashed "+ Start a new trip" grid tile — DTrips.jsx (desktop): an
              in-grid dashed Card. Hidden below `lg`, where the mobile kit (Trips.jsx)
              instead renders a full-width dashed Button below the grid (next sibling).
              The header button above already covers this action, so both are a second,
              faithful-to-kit affordance rather than a new one. `hidden` (not just
              visually hidden) keeps only one of the two out of the a11y tree at a time. */}
          <Link
            href="/trips/new"
            className={cn(
              cardVariants({ radius: "xl", dashed: true, interactive: true }),
              "hidden min-h-36 items-center justify-center p-5 text-center text-sm font-extrabold text-muted-foreground hover:text-foreground lg:flex",
            )}
          >
            + Start a new trip
          </Link>
        </AnimatedList>
      )}
      {trips.length > 0 && (
        <Button asChild variant="dashed" className="w-full lg:hidden">
          <Link href="/trips/new">+ Start a new trip</Link>
        </Button>
      )}
    </div>
  );
}
