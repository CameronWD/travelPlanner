import { GitCompare } from "lucide-react";
import { getComparison } from "@/server/actions/forks";
import { CompareTable } from "@/components/trip/compare-table";
import { EmptyState } from "@/components/ui/empty-state";
import { requireTripAccess, isTripOwnerOrAdmin } from "@/lib/guards";

export default async function ComparePage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  // getComparison enforces requireTripAccess internally; calling it again
  // here is free (cache()-memoised per tripId, see lib/guards.ts) and is how
  // we get the membership role to gate the Promote control (ARCH-DAT-1b:
  // promoting a Fork is owner-only — promoteFork's own server-side gate is
  // the real access control, this only drives whether the button renders).
  const { user, membership } = await requireTripAccess(tripId);
  const isOwner = isTripOwnerOrAdmin(membership, user.email);

  const data = await getComparison(tripId);

  const { trip, plans } = data;

  // No forks yet — show a helpful empty state so the page is still meaningful.
  if (plans.length <= 1) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Compare plans</h2>
        <EmptyState
          icon={GitCompare}
          title="No variants to compare"
          description="Create a fork from the Plan page to start comparing itinerary variants side by side."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Compare plans</h2>

      <CompareTable
        trip={{ id: trip.id, name: trip.name, homeCurrency: trip.homeCurrency }}
        plans={plans}
        isOwner={isOwner}
      />
    </div>
  );
}
