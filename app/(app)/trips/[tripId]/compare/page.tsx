import { GitCompare } from "lucide-react";
import { getComparison } from "@/server/actions/forks";
import { getDiscreetState } from "@/lib/discreet-server";
import { CompareTable } from "@/components/trip/compare-table";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ComparePage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  // requireTripAccess is enforced inside getComparison — no need to call it here.
  const [data, { discreet }] = await Promise.all([
    getComparison(tripId),
    getDiscreetState(),
  ]);

  const { trip, plans } = data;

  // No forks yet — show a helpful empty state so the page is still meaningful.
  if (plans.length <= 1 && !discreet) {
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
        discreet={discreet}
      />
    </div>
  );
}
