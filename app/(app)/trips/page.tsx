import Link from "next/link";
import { PlaneTakeoff } from "lucide-react";
import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TripCard } from "@/components/trip/trip-card";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";

export const metadata = {
  title: "Your trips · Trip Planner",
};

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
          {trips.map((trip, idx) => (
            <AnimatedItem key={trip.id} index={idx}>
              <TripCard
                id={trip.id}
                name={trip.name}
                startDate={trip.startDate}
                endDate={trip.endDate}
                stopCount={trip._count.stops}
              />
            </AnimatedItem>
          ))}
        </AnimatedList>
      )}
    </div>
  );
}
