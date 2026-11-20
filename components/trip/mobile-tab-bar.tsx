"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { AppLink } from "@/components/navigation/app-link";
import { useNavState } from "@/components/navigation/navigation-pending";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { DialogClose } from "@/components/ui/dialog";
import { TabBar, type TabItem } from "@/components/ui/tab-bar";
import { primaryNav, moreNav, isNavActive, isDaysActive } from "@/components/trip/trip-nav";
import { NAV_ICONS } from "@/components/trip/nav-icons";
import { useDaysHref } from "@/components/trip/days-href-context";
import { useTripSlug } from "@/components/trip/use-trip-href";
import { tripPath } from "@/lib/trip-path";
import type { TripPhase } from "@/lib/trip-phase";
import { OPEN_SHARE_EVENT } from "@/components/trip/share-events";
import { cn } from "@/lib/cn";

// Plan-scoped surfaces keep the active variant (?plan=); dated views always follow the real plan.
export function MobileTabBar({ tripId, phase }: { tripId: string; phase?: TripPhase }) {
  // The tapped target lights while its navigation is in flight (ADR 0063);
  // aria-current (and the More trigger's "selected" name) stays on the page
  // actually shown until the new one lands.
  const { pathname: realPathname, effectivePathname: pathname, pendingPathname } = useNavState();
  const planParam = useSearchParams().get("plan");
  const daysHref = useDaysHref();
  const tripRef = useTripSlug(tripId);
  const base = tripPath(tripRef);
  const [open, setOpen] = React.useState(false);

  const nav = primaryNav(tripRef, planParam); // Home, Plan, Days, Calendar, Money, Summary, Reviews
  const more = moreNav(tripRef, planParam); // Wishlist, Journal, Checklists, Files, Activity, Settings, Help
  const byLabel = (label: string) => nav.find((i) => i.label === label)!;

  // Unlike the desktop rail (trip-nav.tsx), which promotes Wishlist to its
  // own item, mobile keeps the primary row at four items (Home, Plan, Days,
  // Money) plus More as the fifth — so all ten routes that have no other
  // mobile entry point (Calendar, Summary, Reviews, Wishlist, Journal,
  // Checklists, Files, Activity, Settings, Help) stay behind this one sheet.
  const travelling = phase === "travelling";
  const ordered = [byLabel("Calendar"), byLabel("Summary"), byLabel("Reviews"), ...more];
  const promoted = ["Files", "Checklists", "Journal"];
  const sheetItems = travelling
    ? [...promoted.map((label) => ordered.find((i) => i.label === label)!), ...ordered.filter((i) => !promoted.includes(i.label))]
    : ordered;
  const sheetActive = sheetItems.some((item) => isNavActive(item.href, pathname, base));
  const sheetActiveItem = sheetItems.find((item) => isNavActive(item.href, realPathname, base));

  const items: TabItem[] = [
    { href: byLabel("Home").href, label: "Home", icon: NAV_ICONS.Home, match: (p) => isNavActive(byLabel("Home").href, p, base) },
    { href: byLabel("Plan").href, label: "Plan", icon: NAV_ICONS.Plan, match: (p) => isNavActive(byLabel("Plan").href, p, base) },
    { href: daysHref ?? byLabel("Days").href, label: "Days", icon: NAV_ICONS.Days, match: (p) => isDaysActive(byLabel("Days").href, p, base) },
    { href: byLabel("Money").href, label: "Money", icon: NAV_ICONS.Money, match: (p) => isNavActive(byLabel("Money").href, p, base) },
    {
      href: tripPath(tripRef, "/more"),
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
            "relative flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 truncate rounded-md text-xs transition-colors duration-[var(--dur-fast)]",
            active ? "font-extrabold text-on-accent" : "font-semibold text-muted-foreground",
          )}
        >
          <NAV_ICONS.More className="size-4" aria-hidden="true" />
          More
        </button>
      ),
    },
  ];

  return (
    <>
      <TabBar items={items} aria-label="Trip sections" />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" hideClose>
          <div className="flex items-center gap-3">
            <SheetTitle className="min-w-0 flex-1 font-display text-[28px] leading-none">More</SheetTitle>
            <DialogClose className="grid size-11 shrink-0 place-items-center rounded-sm border-2 border-border bg-card text-foreground">
              <X className="size-5" strokeWidth={2.5} aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
          <SheetDescription className="sr-only">Jump to a trip section</SheetDescription>
          <div role="group" aria-label="Trip sections" className="flex flex-col divide-y-2 divide-muted overflow-hidden rounded-[14px] border-2 border-border bg-card">
            {sheetItems.map((item) => (
              <AppLink
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isNavActive(item.href, realPathname, base) ? "page" : undefined}
                data-pending={pendingPathname != null && isNavActive(item.href, pendingPathname, base) ? "true" : undefined}
                className="flex min-h-12 w-full items-center px-3.5 text-left text-sm font-bold aria-[current=page]:bg-muted"
              >
                {item.label}
              </AppLink>
            ))}
            {travelling && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new Event(OPEN_SHARE_EVENT));
                }}
                className="flex min-h-12 w-full items-center px-3.5 text-left text-sm font-bold aria-[current=page]:bg-muted"
              >
                Share
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
