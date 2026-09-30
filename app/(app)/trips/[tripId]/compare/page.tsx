import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Copy } from "lucide-react";
import { getComparison } from "@/server/actions/forks";
import { CompareTable } from "@/components/trip/compare-table";
import { EmptyState } from "@/components/ui/empty-state";
import { requireTripAccess, isTripOwnerOrAdmin } from "@/lib/guards";
import { readTripShell } from "@/lib/trip-shell-reads";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { PageHeader } from "@/components/ui/page-header";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";
import { comparePlansMeta } from "@/lib/page-meta";

export const metadata: Metadata = { title: "Compare plans" };

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

  const [data, shell, slug] = await Promise.all([
    getComparison(tripId),
    readTripShell(tripId),
    tripSlugFor(tripId),
  ]);

  const { trip, plans } = data;

  // Plan variants off (spec B3): Forks are dormant, so there is nothing to
  // compare — an old Compare link lands on the real plan instead.
  if (!trip.forksEnabled) redirect(tripPath(slug, "/plan"));

  const header = (
    <PageHeader
      eyebrow={shell?.name}
      title="Compare plans"
      meta={comparePlansMeta(plans.length)}
      metaOnMobile
      trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
    />
  );

  // No forks yet — show a helpful empty state so the page is still meaningful.
  if (plans.length <= 1) {
    return (
      <div className="flex flex-col gap-3 md:gap-[18px]">
        {header}
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
      {header}

      <CompareTable
        trip={{ id: trip.id, name: trip.name, homeCurrency: trip.homeCurrency }}
        plans={plans}
        isOwner={isOwner}
      />
    </div>
  );
}
