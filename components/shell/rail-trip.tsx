"use client";

import type { Route } from "next";
import * as React from "react";
import type { ReactNode } from "react";
import type { SidebarNavCounts } from "@/components/shell/sidebar-nav";

export interface RailTrip {
  id: string;
  /** URL ref (ADR 0064) — matched against the pathname's segment. */
  slug: string;
  name: string;
  daysHref: Route | null;
  counts?: SidebarNavCounts;
  switcher?: ReactNode;
}

interface RailTripState {
  trip: RailTrip | null;
  publish: (t: RailTrip | null) => void;
  /**
   * The URL trip segment whose trip layout failed (404 or error) — published
   * by TripBoundaryRailShell, so the rail shows its off-Trip branch there
   * instead of URL-built rows and a skeleton that never resolves.
   */
  failedSeg: string | null;
  publishFailed: (seg: string | null) => void;
}

const Ctx = React.createContext<RailTripState>({
  trip: null,
  publish: () => {},
  failedSeg: null,
  publishFailed: () => {},
});

/**
 * The one thing the persistent rail (AppShellRail) cannot read off the URL:
 * the Trip's name, its default Days date and its Plan/Wishlist counts. The
 * trip layout publishes them here as it renders; until then the rail shows
 * the rows built from the URL and a skeleton where the switcher card goes
 * (ADR 0062, amended 2026-09-29; Feedback cmumclo5t000004jyyll3imed). A
 * boundary above the trip layout (not-found, trips error) instead marks the
 * segment as failed, and the rail falls back to its trips-level branch.
 */
export function RailTripProvider({ children }: { children: ReactNode }) {
  const [trip, setTrip] = React.useState<RailTrip | null>(null);
  const [failedSeg, setFailedSeg] = React.useState<string | null>(null);
  const value = React.useMemo(
    () => ({ trip, publish: setTrip, failedSeg, publishFailed: setFailedSeg }),
    [trip, failedSeg],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRailTrip(): RailTripState {
  return React.useContext(Ctx);
}

/** Rendered by the trip layout. Publishes on mount and whenever the Trip changes; clears on unmount. */
export function RailTripPublisher(props: RailTrip): null {
  const { publish } = useRailTrip();
  const { id, slug, name, daysHref, counts, switcher } = props;
  React.useEffect(() => {
    publish({ id, slug, name, daysHref, counts, switcher });
  }, [publish, id, slug, name, daysHref, counts, switcher]);
  React.useEffect(() => () => publish(null), [publish]);
  return null;
}
