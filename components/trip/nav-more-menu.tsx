"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isNavActive, type NavItem } from "@/components/trip/trip-nav";
import { cn } from "@/lib/cn";

/**
 * The rail's "More" slot (components/trip/trip-nav.tsx). Presentational
 * enough to live outside components/ui only because it renders the same
 * Dock-item chrome inline — Dock's `render` slot hands it the whole cell, so
 * it has to look like every other item, not because it carries nav data of
 * its own (it takes `items` and `active` from the caller).
 *
 * A dropdown, not the mobile bottom sheet: aside from the trigger, this has
 * nothing in common with the mobile More sheet in mobile-tab-bar.tsx.
 */
export function NavMoreMenu({
  tripId,
  items,
  active,
}: {
  tripId: string;
  items: NavItem[];
  active: boolean;
}) {
  const pathname = usePathname();
  const base = `/trips/${tripId}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More trip sections"
        aria-current={active ? "page" : undefined}
        className={cn(
          "grid h-11 w-16 place-items-center rounded-md border-2 text-[11px] font-bold",
          active
            ? "border-border bg-coral font-extrabold shadow-hard-1"
            : "border-transparent text-muted-foreground",
        )}
      >
        More
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right">
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link
              href={item.href}
              aria-current={isNavActive(item.href, pathname, base) ? "page" : undefined}
            >
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
