"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

interface NavItem {
  label: string;
  href: string;
}

function navItems(tripId: string): NavItem[] {
  const base = `/trips/${tripId}`;
  return [
    { label: "Overview", href: base },
    { label: "Calendar", href: `${base}/calendar` },
    { label: "Today", href: `${base}/today` },
    { label: "Journal", href: `${base}/journal` },
    { label: "Wishlist", href: `${base}/wishlist` },
    { label: "Budget", href: `${base}/budget` },
    { label: "Summary", href: `${base}/summary` },
    { label: "Checklists", href: `${base}/checklists` },
    { label: "Files", href: `${base}/files` },
    { label: "Settings", href: `${base}/settings` },
  ];
}

interface TripNavProps {
  tripId: string;
}

/**
 * Horizontal scrollable navigation bar for a trip's sections.
 * Active tab is highlighted with a coral underline using design tokens.
 */
export function TripNav({ tripId }: TripNavProps) {
  const pathname = usePathname();
  const items = navItems(tripId);

  function isActive(href: string): boolean {
    // The overview is exact-match; all others are prefix-match so sub-routes
    // keep the correct tab highlighted.
    if (href === `/trips/${tripId}`) {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav
      aria-label="Trip sections"
      className="border-b border-border"
    >
      <div
        className={cn(
          "flex overflow-x-auto scrollbar-none gap-0",
          // Negative margin trick to make the border sit flush
        )}
      >
        {items.map((item) => {
          const active = isActive(item.href);
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
      </div>
    </nav>
  );
}
