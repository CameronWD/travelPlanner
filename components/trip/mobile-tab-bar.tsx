"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map, CalendarDays, Wallet, Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { moreNav, isNavActive } from "@/components/trip/trip-nav";
import { cn } from "@/lib/cn";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  Plan: Map,
  Calendar: CalendarDays,
  Budget: Wallet,
};

export function MobileTabBar({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const base = `/trips/${tripId}`;
  const [open, setOpen] = React.useState(false);

  const primary = [
    { label: "Home", href: base },
    { label: "Plan", href: `${base}/plan` },
    { label: "Calendar", href: `${base}/calendar` },
    { label: "Budget", href: `${base}/budget` },
  ];

  // Summary lives under More on mobile.
  const more = [
    { label: "Summary", href: `${base}/summary` },
    ...moreNav(tripId),
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 backdrop-blur md:hidden"
      aria-label="Trip sections"
    >
      {primary.map((item) => {
        const Icon = ICONS[item.label] ?? Home;
        const active = isNavActive(item.href, pathname, base);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs",
              active ? "text-primary" : "text-muted-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-5" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}

      <Sheet open={open} onOpenChange={setOpen}>
        {/* asChild lets us apply className to the underlying button */}
        <SheetTrigger asChild>
          <button className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-muted-foreground">
            <Menu className="size-5" aria-hidden="true" />
            More
          </button>
        </SheetTrigger>
        <SheetContent side="bottom">
          {/* Visually-hidden title and description for a11y */}
          <SheetTitle className="sr-only">More navigation</SheetTitle>
          <SheetDescription className="sr-only">Jump to a trip section</SheetDescription>
          <div className="flex flex-col gap-1 p-2">
            {more.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
