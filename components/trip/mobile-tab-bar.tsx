"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { TabBar, type TabItem } from "@/components/ui/tab-bar";
import { primaryNav, moreNav, isNavActive } from "@/components/trip/trip-nav";
import { cn } from "@/lib/cn";

// Plan-scoped surfaces keep the active variant (?plan=); dated views always follow the real plan.
export function MobileTabBar({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const planParam = useSearchParams().get("plan");
  const base = `/trips/${tripId}`;
  const [open, setOpen] = React.useState(false);

  const nav = primaryNav(tripId, planParam); // Home, Plan, Days, Money, Summary
  const more = moreNav(tripId, planParam); // Wishlist, Journal, Checklists, Files, Activity, Settings, Help
  const byLabel = (label: string) => nav.find((i) => i.label === label)!;

  // Unlike the desktop rail (trip-nav.tsx), which promotes Wishlist to its
  // own item, mobile keeps the primary row at four items (Home, Plan, Days,
  // Money) plus More as the fifth — so all eight routes that have no other
  // mobile entry point (Wishlist, Journal, Checklists, Files, Activity,
  // Settings, Help, Summary) stay behind this one sheet.
  const sheetItems = [byLabel("Summary"), ...more];
  const sheetActiveItem = sheetItems.find((item) => isNavActive(item.href, pathname, base));
  const sheetActive = sheetActiveItem !== undefined;

  const items: TabItem[] = [
    { href: byLabel("Home").href, label: "Home", match: (p) => isNavActive(byLabel("Home").href, p, base) },
    { href: byLabel("Plan").href, label: "Plan", match: (p) => isNavActive(byLabel("Plan").href, p, base) },
    { href: byLabel("Days").href, label: "Days", match: (p) => isNavActive(byLabel("Days").href, p, base) },
    { href: byLabel("Money").href, label: "Money", match: (p) => isNavActive(byLabel("Money").href, p, base) },
    {
      href: `${base}/more`,
      label: "More",
      match: () => sheetActive,
      render: (active) => (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          // Not aria-current="page" — this opens a sheet, it isn't a page,
          // and the real current item inside the sheet already carries
          // aria-current (below). The accessible name carries the same
          // "a route behind this trigger is current" signal instead.
          aria-label={sheetActiveItem ? `More trip sections, ${sheetActiveItem.label} selected` : undefined}
          className={cn(
            "relative grid h-11 min-w-0 flex-1 place-items-center truncate rounded-md text-xs transition-colors duration-[var(--dur-fast)]",
            active ? "font-extrabold text-on-accent" : "font-semibold text-muted-foreground",
          )}
        >
          More
        </button>
      ),
    },
  ];

  return (
    <>
      <TabBar items={items} aria-label="Trip sections" />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom">
          {/* Visually-hidden title and description for a11y */}
          <SheetTitle className="sr-only">More navigation</SheetTitle>
          <SheetDescription className="sr-only">Jump to a trip section</SheetDescription>
          <div className="flex flex-col gap-1 p-2">
            {sheetItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isNavActive(item.href, pathname, base) ? "page" : undefined}
                className="rounded-xl px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
