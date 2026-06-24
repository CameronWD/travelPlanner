"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NavMoreMenu } from "@/components/trip/nav-more-menu";

export interface NavItem {
  label: string;
  href: string;
}

export function primaryNav(tripId: string): NavItem[] {
  const base = `/trips/${tripId}`;
  return [
    { label: "Home", href: base },
    { label: "Plan", href: `${base}/plan` },
    { label: "Calendar", href: `${base}/calendar` },
    { label: "Budget", href: `${base}/budget` },
    { label: "Summary", href: `${base}/summary` },
  ];
}

export function moreNav(tripId: string): NavItem[] {
  const base = `/trips/${tripId}`;
  return [
    { label: "Wishlist", href: `${base}/wishlist` },
    { label: "Journal", href: `${base}/journal` },
    { label: "Checklists", href: `${base}/checklists` },
    { label: "Files", href: `${base}/files` },
    { label: "Activity", href: `${base}/activity` },
    { label: "Settings", href: `${base}/settings` },
  ];
}

/** Exact-match for Home (base), prefix-match for everything else. */
export function isNavActive(
  href: string,
  pathname: string,
  base: string,
): boolean {
  if (href === base) return pathname === base;
  return pathname === href || pathname.startsWith(href + "/");
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
  const base = `/trips/${tripId}`;
  const items = primaryNav(tripId);

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
                  ? "text-foreground"
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
