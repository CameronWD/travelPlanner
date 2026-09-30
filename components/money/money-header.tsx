import { PageHeader } from "@/components/ui/page-header";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";
import { AddCostButton } from "@/components/money/add-cost-button";
import { SplitWithPill } from "@/components/money/split-with-pill";
import type { TravellerLike } from "@/lib/traveller";

export interface MoneyHeaderProps {
  tripId: string;
  slug: string;
  tripName: string;
  meta: string;
  members: TravellerLike[];
  homeCurrency: string;
  /** False on a fork — there's no cost to add to a fork (MONEY.md §2). */
  showAddCost: boolean;
}

/** Money's PageHeader: eyebrow + "Money" + meta, bell/fork trailing, Split
 * with N and + Add a cost in actions/mobileAction. */
export function MoneyHeader({ tripId, slug, tripName, meta, members, homeCurrency, showAddCost }: MoneyHeaderProps) {
  return (
    <PageHeader
      eyebrow={tripName}
      title="Money"
      meta={meta}
      trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
      actions={
        <>
          <SplitWithPill slug={slug} members={members} />
          {showAddCost ? <AddCostButton tripId={tripId} homeCurrency={homeCurrency} variant="pill" /> : null}
        </>
      }
      mobileAction={showAddCost ? <AddCostButton tripId={tripId} homeCurrency={homeCurrency} variant="round" /> : undefined}
    />
  );
}
