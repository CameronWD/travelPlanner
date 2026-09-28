import { Suspense } from "react";
import { loadNavCounts } from "@/lib/nav-counts";
import { COUNT_CLASS, type SidebarNavCounts } from "@/components/shell/sidebar-nav";

/** Plan row's count: Flags on the real plan. Hidden (renders nothing) at 0. */
export async function PlanCount({ tripId }: { tripId: string }) {
  const { flags } = await loadNavCounts(tripId);
  if (flags <= 0) return null;
  return <span className={COUNT_CLASS}>{flags}</span>;
}

/** Wishlist row's count: saved ideas. Hidden (renders nothing) at 0. */
export async function WishlistCount({ tripId }: { tripId: string }) {
  const { wishlist } = await loadNavCounts(tripId);
  if (wishlist <= 0) return null;
  return <span className={COUNT_CLASS}>{wishlist}</span>;
}

/**
 * The sidebar nav's Plan/Wishlist counts (Task 12), each in its own
 * `<Suspense>` boundary so the nav itself never waits on `loadNavCounts` —
 * the rows render immediately and the numbers pop in once the (cached, per
 * request) query resolves.
 */
export function sidebarNavCounts(tripId: string): SidebarNavCounts {
  return {
    Plan: (
      <Suspense fallback={null}>
        <PlanCount tripId={tripId} />
      </Suspense>
    ),
    Wishlist: (
      <Suspense fallback={null}>
        <WishlistCount tripId={tripId} />
      </Suspense>
    ),
  };
}
