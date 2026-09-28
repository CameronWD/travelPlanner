"use client";

import { LayoutGrid, Globe, UserRound } from "lucide-react";
import { TabBar, type TabItem } from "@/components/ui/tab-bar";
import { isGlobeActive, isTripsActive } from "@/components/shell/app-paths";

const ITEMS: TabItem[] = [
  { href: "/trips", label: "Trips", match: isTripsActive, icon: LayoutGrid },
  { href: "/globe", label: "Globe", match: isGlobeActive, icon: Globe },
  { href: "/account", label: "You", match: (p) => p === "/account" || p.startsWith("/account/"), icon: UserRound },
];

/**
 * Phone tab bar on trips-level pages (spec D4): Trips, Globe, You — the same
 * three destinations as the tablet Dock (components/app-rail.tsx), replacing
 * the phone top bar there. Mounted by app/(app)/layout.tsx inside
 * <OutsideTrip>; inside a Trip, MobileTabBar (components/trip/mobile-tab-bar.tsx)
 * is the phone tab bar instead, and the top bar stays.
 */
export function AppTabBar() {
  return <TabBar items={ITEMS} aria-label="Teepee" className="bg-sun" />;
}
