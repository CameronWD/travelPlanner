import type { Metadata } from "next";
import Link from "next/link";
import { PlaneTakeoff, Table } from "lucide-react";
import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TripCard } from "@/components/trip/trip-card";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { describePhase, compareForTripList } from "@/lib/trip-phase";
import { todayISO, formatDateRange } from "@/lib/dates";
import { getDiscreetState } from "@/lib/discreet-server";
import { ProjectTable, type ProjectRow } from "@/components/discreet/project-table";

export async function generateMetadata(): Promise<Metadata> {
  const { discreet, label } = await getDiscreetState();
  return { title: discreet ? label : "Your trips · TEEPEE" };
}

export default async function TripsPage() {
  const user = await requireUser();

  // Fetch trips where the current user is a member, newest first.
  const memberships = await db.tripMember.findMany({
    where: { userId: user.id },
    include: {
      trip: {
        include: {
          _count: { select: { stops: true } },
        },
      },
    },
    orderBy: { trip: { createdAt: "desc" } },
  });

  const trips = memberships.map((m) => m.trip);

  const tripIds = trips.map((t) => t.id);

  // Fetch located stops for route-render cover fallback.
  const coverStopsRaw = await db.stop.findMany({
    where: { tripId: { in: tripIds }, forkId: null, lat: { not: null }, lng: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { tripId: true, lat: true, lng: true },
  });
  const coverStopsByTrip = new Map<string, { lat: number; lng: number }[]>();
  for (const s of coverStopsRaw) {
    const arr = coverStopsByTrip.get(s.tripId) ?? [];
    arr.push({ lat: s.lat as number, lng: s.lng as number });
    coverStopsByTrip.set(s.tripId, arr);
  }

  // Build cover key presence per trip from the memberships query already in hand.
  const hasCoverByTrip = new Map(trips.map((t) => [t.id, t.coverImageKey != null]));

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
  const sorted = [...trips].sort((a, b) => compareForTripList(a, b, today));

  const { discreet } = await getDiscreetState();
  if (discreet) {
    if (trips.length === 0) {
      return (
        <div className="space-y-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Projects</h1>
          <EmptyState
            icon={Table}
            title="No projects yet"
            description="Create a project to get started."
            action={
              <Button asChild>
                <Link href="/trips/new">New project</Link>
              </Button>
            }
          />
        </div>
      );
    }
    const projects: ProjectRow[] = sorted.map((trip) => ({
      id: trip.id,
      name: trip.name,
      status: describePhase({ startDate: trip.startDate, endDate: trip.endDate, today }).label,
      dateRange: trip.startDate && trip.endDate ? formatDateRange(trip.startDate, trip.endDate) : "Dates TBC",
      locations: trip._count.stops,
    }));
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Projects</h1>
        <ProjectTable projects={projects} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Your trips
        </h1>
        <Button asChild>
          <Link href="/trips/new">New trip</Link>
        </Button>
      </div>

      {/* Trips grid / empty state */}
      {trips.length === 0 ? (
        <EmptyState
          icon={PlaneTakeoff}
          title="No trips yet"
          description="Create your first trip and start planning your next adventure together."
          action={
            <Button asChild>
              <Link href="/trips/new">New trip</Link>
            </Button>
          }
        />
      ) : (
        <AnimatedList className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" staggerOnMount>
          {sorted.map((trip, idx) => (
            <AnimatedItem key={trip.id} index={idx}>
              <TripCard
                id={trip.id}
                name={trip.name}
                startDate={trip.startDate}
                endDate={trip.endDate}
                stopCount={trip._count.stops}
                phase={describePhase({ startDate: trip.startDate, endDate: trip.endDate, today })}
                unreadCount={unreadByTrip[trip.id] ?? 0}
                hasCover={hasCoverByTrip.get(trip.id) ?? false}
                coverStops={coverStopsByTrip.get(trip.id) ?? []}
              />
            </AnimatedItem>
          ))}
        </AnimatedList>
      )}
    </div>
  );
}
