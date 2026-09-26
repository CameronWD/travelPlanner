import type { Metadata } from "next";
import { Copy } from "lucide-react";
import { getComparison } from "@/server/actions/forks";
import { CompareTable } from "@/components/trip/compare-table";
import { EmptyState } from "@/components/ui/empty-state";
import { requireTripAccess, isTripOwnerOrAdmin } from "@/lib/guards";

export const metadata: Metadata = { title: "Compare plans" };

/** Kit display title (same as Checklists / Files). Exported for tests. */
export const COMPARE_TITLE_CLASS =
  "font-display text-[28px] font-extrabold leading-none tracking-[-0.035em] text-foreground sm:text-4xl";

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
      <div className="flex flex-col gap-3 md:gap-[18px]">
        <h2 className={COMPARE_TITLE_CLASS}>Compare plans</h2>
        <EmptyState
          icon={Copy}
          tone="coral"
          title="No variants to compare"
          description="Create a fork from the Plan page to start comparing itinerary variants side by side."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 md:gap-[18px]">
      <h2 className={COMPARE_TITLE_CLASS}>Compare plans</h2>

      <CompareTable
        trip={{ id: trip.id, name: trip.name, homeCurrency: trip.homeCurrency }}
        plans={plans}
        isOwner={isOwner}
      />
    </div>
  );
}
