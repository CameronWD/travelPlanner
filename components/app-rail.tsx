"use client";

import { usePathname } from "next/navigation";
import { isTripPath } from "@/components/shell/app-paths";

/**
 * Children only outside a Trip — the app layout's AppTabBar (phones), which
 * the trip layout's MobileTabBar replaces inside a Trip (never two).
 */
export function OutsideTrip({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (isTripPath(path)) return null;
  return <>{children}</>;
}

/**
 * Children only inside a Trip — the inverse of OutsideTrip. The phone top bar
 * (app/(app)/layout.tsx) uses this: on a trip path it stays, exactly as
 * before; outside a Trip it's replaced by the AppTabBar (spec D4).
 */
export function OnTripPath({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (!isTripPath(path)) return null;
  return <>{children}</>;
}

/**
 * For a boundary ABOVE the trip layout — app/(app)/not-found.tsx and
 * app/(app)/trips/error.tsx. A pass-through now: the rail (AppShellRail)
 * lives in the app layout and is on screen above any boundary, trip path or
 * not — on a failed Trip it shows the rows built from the URL and a skeleton
 * switcher (ADR 0062, amended 2026-09-29). Kept so the boundaries have one
 * place to change if they ever need chrome of their own again.
 */
export function TripBoundaryRailShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
