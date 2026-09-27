"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { tripRailItems } from "@/components/trip/trip-nav";
import { isGlobeActive, isTripsActive } from "@/components/shell/app-paths";
import { cn } from "@/lib/cn";

/**
 * Optional count beside a trip nav row (Task 12 fills these: Plan = Flags on
 * the real plan, Wishlist = ideas; hidden at 0).
 */
export interface SidebarNavCounts {
  Plan?: ReactNode;
  Wishlist?: ReactNode;
}

/**
 * 42px row; the `before:` overlay grows the hit area 1px above and below to
 * the 44px floor without shifting layout. Inactive rows carry a transparent
 * 2px border so the active/hover border never moves the label.
 */
function rowClass(active: boolean) {
  return cn(
    "relative flex h-[42px] items-center justify-between gap-2 rounded-xl border-2 px-3 text-[15px] font-bold text-foreground",
    "before:absolute before:inset-x-0 before:-inset-y-px before:content-['']",
    active ? "border-border bg-coral shadow-hard-1" : "border-transparent hover:border-border",
  );
}

function Row({ href, label, active, count }: { href: string; label: string; active: boolean; count?: ReactNode }) {
  return (
    <li className="py-px">
      <Link href={href} aria-current={active ? "page" : undefined} className={rowClass(active)}>
        <span className="truncate">{label}</span>
        {count}
      </Link>
    </li>
  );
}

/**
 * The sidebar's navigation (≥1280px): the seven trip rows when inside a Trip —
 * the same model as the Dock (tripRailItems), so ?plan= threading and the
 * active rules are shared — then the "ALL TRIPS" section with Trips and
 * Globe. Active state reads the live pathname and ?plan= on the client, since
 * the layouts that mount the sidebar are preserved across navigations.
 */
export function SidebarNav({ tripId, counts }: { tripId?: string | null; counts?: SidebarNavCounts }) {
  const pathname = usePathname() ?? "";
  const planParam = useSearchParams().get("plan");
  const tripItems = tripId ? tripRailItems(tripId, planParam) : [];

  return (
    <nav aria-label="Main" className="flex flex-col">
      {tripItems.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {tripItems.map((item) => (
            <Row
              key={item.label}
              href={item.href}
              label={item.label}
              active={item.match(pathname)}
              count={item.label === "Plan" || item.label === "Wishlist" ? counts?.[item.label] : undefined}
            />
          ))}
        </ul>
      )}
      <p className="mx-3 mb-1 mt-4 text-[11px] font-extrabold uppercase tracking-[0.08em] text-on-accent-muted">
        All trips
      </p>
      <ul className="flex flex-col gap-0.5">
        <Row href="/trips" label="Trips" active={isTripsActive(pathname)} />
        <Row href="/globe" label="Globe" active={isGlobeActive(pathname)} />
      </ul>
    </nav>
  );
}
