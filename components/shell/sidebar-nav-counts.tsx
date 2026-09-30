import { Suspense } from "react";
import { loadNavCounts } from "@/lib/nav-counts";
import { loadMoneyDueCount } from "@/lib/money-due-count";
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

/** Money row's count: unpaid costs overdue or due within 14 days. Hidden (renders nothing) at 0. */
export async function MoneyCount({ tripId }: { tripId: string }) {
  const due = await loadMoneyDueCount(tripId);
  if (due <= 0) return null;
  return <span className={COUNT_CLASS}>{due}</span>;
}

/**
 * The sidebar nav's Plan/Wishlist/Money counts (Task 12; Money added Phase 1
 * Task 7), each in its own `<Suspense>` boundary so the nav itself never
 * waits on `loadNavCounts`/`loadMoneyDueCount` — the rows render immediately
 * and the numbers pop in once the (cached, per request) query resolves.
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
    Money: (
      <Suspense fallback={null}>
        <MoneyCount tripId={tripId} />
      </Suspense>
    ),
  };
}
