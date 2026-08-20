"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { NavMoreMenu } from "@/components/trip/nav-more-menu";

export interface NavItem {
  label: string;
  href: string;
}

// Plan-scoped surfaces keep the active variant (?plan=); dated views always follow the real plan.
export function primaryNav(tripId: string, planParam?: string | null): NavItem[] {
  const base = `/trips/${tripId}`;
  const plan = planParam ? `?plan=${encodeURIComponent(planParam)}` : "";
  return [
    { label: "Home", href: base },
    { label: "Plan", href: `${base}/plan${plan}` },
    { label: "Calendar", href: `${base}/calendar` },
    { label: "Budget", href: `${base}/budget${plan}` },
    { label: "Summary", href: `${base}/summary` },
  ];
}

// Plan-scoped surfaces keep the active variant (?plan=); dated views always follow the real plan.
export function moreNav(tripId: string, planParam?: string | null): NavItem[] {
  const base = `/trips/${tripId}`;
  const plan = planParam ? `?plan=${encodeURIComponent(planParam)}` : "";
  return [
    { label: "Wishlist", href: `${base}/wishlist${plan}` },
    { label: "Journal", href: `${base}/journal` },
    { label: "Checklists", href: `${base}/checklists` },
    { label: "Files", href: `${base}/files` },
    { label: "Activity", href: `${base}/activity` },
    { label: "Settings", href: `${base}/settings` },
    { label: "Help", href: `${base}/help` },
  ];
}

/** Exact-match for Home (base), prefix-match for everything else. Ignores query strings. */
export function isNavActive(
  href: string,
  pathname: string,
  base: string,
): boolean {
  const path = href.split("?")[0];
  if (path === base) return pathname === base;
  return pathname === path || pathname.startsWith(path + "/");
}

interface TripNavProps {
  tripId: string;
}

/**
 * Horizontal navigation bar for a trip's sections (desktop only).
 * Primary tabs are always visible; overflow items live in the "More" dropdown.
 * Active tab is highlighted with a coral underline using design tokens.
 */
export function TripNav({ tripId }: TripNavProps) {
  const pathname = usePathname();
  const planParam = useSearchParams().get("plan");
  const base = `/trips/${tripId}`;
  const items = primaryNav(tripId, planParam);

  return (
    <nav
      aria-label="Trip sections"
      className="hidden border-b border-border md:flex"
    >
      <div className="flex overflow-x-auto scrollbar-none gap-0">
        {items.map((item) => {
          const active = isNavActive(item.href, pathname, base);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative shrink-0 px-4 py-3 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground/80",
              )}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
              {/* Active indicator: coral underline */}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary"
                />
              )}
            </Link>
          );
        })}
        <NavMoreMenu tripId={tripId} />
      </div>
    </nav>
  );
}
