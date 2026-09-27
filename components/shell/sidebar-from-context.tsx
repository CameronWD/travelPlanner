"use client";

import type { ReactNode } from "react";
import { Sidebar, SidebarTripPlaceholder } from "@/components/shell/sidebar";
import type { SidebarNavCounts } from "@/components/shell/sidebar-nav";
import { useShellUser } from "@/components/shell/shell-user";

/**
 * The sidebar where the Traveller isn't in hand as props: the trip layout
 * (which doesn't load the signed-in Traveller) and the boundary shells above
 * it (client components). Reads ShellUserProvider from the app layout, so no
 * second query; renders nothing outside it.
 */
export function SidebarFromContext({
  trip,
  switcher,
  counts,
}: {
  trip: { id: string; name: string } | null;
  switcher?: ReactNode;
  counts?: SidebarNavCounts;
}) {
  const shell = useShellUser();
  if (!shell) return null;
  return (
    <Sidebar
      {...shell}
      trip={trip}
      switcher={switcher ?? <SidebarTripPlaceholder trip={trip} />}
      counts={counts}
    />
  );
}
