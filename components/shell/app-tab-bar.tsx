"use client";

import { LayoutGrid, Globe, UserRound } from "lucide-react";
import { TabBar, type TabItem } from "@/components/ui/tab-bar";
import { isGlobeActive, isTripsActive } from "@/components/shell/app-paths";
import { useShellUser } from "@/components/shell/shell-user";
import { AdminQueueDot } from "@/components/shell/admin-queue-dot";
import { EMPTY_ADMIN_QUEUE, hasAdminQueue, withAdminQueueName } from "@/lib/admin-queue";

const isYou = (p: string) => p === "/account" || p.startsWith("/account/");

/**
 * Phone tab bar on trips-level pages (spec D4): Trips, Globe, You — the same
 * three destinations as the tablet Dock (components/app-rail.tsx), replacing
 * the phone top bar there. Mounted by app/(app)/layout.tsx inside
 * <OutsideTrip>; inside a Trip, MobileTabBar (components/trip/mobile-tab-bar.tsx)
 * is the phone tab bar instead, and the top bar stays.
 *
 * The You tab carries the Admin queue dot (CONTEXT.md; spec 2026-10-02 §B):
 * outside a Trip a phone has no avatar, and /trips is where a phone lands
 * after sign-in, so this is the one place the dot can be seen there. Reads
 * the shell for the count; renders no dot outside ShellUserProvider or for
 * a non-Admin.
 */
export function AppTabBar() {
  const shell = useShellUser();
  const isAdmin = shell?.isAdmin ?? false;
  const queue = shell?.adminQueue ?? EMPTY_ADMIN_QUEUE;
  const lit = hasAdminQueue(isAdmin, queue);
  const items: TabItem[] = [
    { href: "/trips", label: "Trips", match: isTripsActive, icon: LayoutGrid },
    { href: "/globe", label: "Globe", match: isGlobeActive, icon: Globe },
    {
      href: "/account",
      label: "You",
      match: isYou,
      icon: UserRound,
      // On the 16px icon: a 10px dot at its top-right corner, ringed in the
      // bar's own sun so it reads on the active coral pill and off it alike.
      indicator: lit ? <AdminQueueDot className="-right-1.5 -top-1.5 size-2.5 border-sun" /> : undefined,
      "aria-label": lit ? withAdminQueueName("You", isAdmin, queue) : undefined,
    },
  ];
  return <TabBar items={items} aria-label="Teepee" className="bg-sun" />;
}
