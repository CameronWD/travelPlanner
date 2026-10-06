import { PageHeader } from "@/components/ui/page-header";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";
import { AddCostButton } from "@/components/money/add-cost-button";
import { AddCostFromUrl } from "@/components/money/add-cost-from-url";
import { SplitWithPill } from "@/components/money/split-with-pill";
import type { TravellerLike } from "@/lib/traveller";
import type { OtherCostDefaults } from "@/lib/money/other-cost-defaults";

export interface MoneyHeaderProps {
  tripId: string;
  slug: string;
  tripName: string;
  meta: string;
  members: TravellerLike[];
  homeCurrency: string;
  /** False on a fork — there's no cost to add to a fork (MONEY.md §2). */
  showAddCost: boolean;
  /** Phase-aware starting values for a new cost (spec 2026-10-06 §K). */
  costDefaults?: OtherCostDefaults;
}

/** Money's PageHeader: eyebrow + "Money" + meta, bell/fork trailing, Split
 * with N and + Add a cost in actions/mobileAction. Also owns `?add=cost`. */
export function MoneyHeader({ tripId, slug, tripName, meta, members, homeCurrency, showAddCost, costDefaults }: MoneyHeaderProps) {
  return (
    <>
      {showAddCost ? <AddCostFromUrl tripId={tripId} homeCurrency={homeCurrency} defaults={costDefaults} /> : null}
      <PageHeader
        eyebrow={tripName}
        title="Money"
        meta={meta}
        trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
        actions={
          <>
            <SplitWithPill slug={slug} members={members} />
            {showAddCost ? <AddCostButton tripId={tripId} homeCurrency={homeCurrency} variant="pill" defaults={costDefaults} /> : null}
          </>
        }
        mobileAction={showAddCost ? <AddCostButton tripId={tripId} homeCurrency={homeCurrency} variant="round" defaults={costDefaults} /> : undefined}
      />
    </>
  );
}
