"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { isTripPath } from "@/components/shell/app-paths";
import { useRailTrip } from "@/components/shell/rail-trip";

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
 * app/(app)/trips/error.tsx. It renders no chrome of its own: the rail
 * (AppShellRail) lives in the app layout and is on screen above any
 * boundary. On a trip path it marks that trip segment as failed, so the rail
 * shows its trips-level branch — the Trips/Globe/You Dock and the Back-to
 * card (or "Choose a trip") — not rows into a Trip that doesn't exist and a
 * skeleton switcher that never resolves (ADR 0062, amended 2026-09-29).
 */
export function TripBoundaryRailShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { publishFailed } = useRailTrip();
  const seg = isTripPath(path) ? path!.split("/")[2]! : null;
  React.useEffect(() => {
    publishFailed(seg);
    return () => publishFailed(null);
  }, [publishFailed, seg]);
  return <>{children}</>;
}
