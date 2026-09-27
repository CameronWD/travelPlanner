"use client";

import * as React from "react";
import type { TravellerLike } from "@/lib/traveller";

/** One row in the trip switcher (Task 12): id/name for the link, and the
 * "68 sleeps to go" / "Day 5 of 35" / "Back home" line (lib/trip-status-line.ts),
 * precomputed server-side against that trip's own current-stop timezone. */
export interface SwitcherTrip {
  id: string;
  name: string;
  statusLine: string;
}

/**
 * The signed-in Traveller as the app shell's chrome needs them: who they are
 * (avatar, name, email for the menu label), whether the Admin entry and its
 * pending Access request badge show, and their trips (for the switcher),
 * ordered like the trips list itself (compareForTripList).
 */
export interface ShellUser {
  user: TravellerLike & { email: string | null };
  isAdmin: boolean;
  pendingAccessRequests: number;
  trips: SwitcherTrip[];
}

const ShellUserContext = React.createContext<ShellUser | null>(null);

/**
 * Mounted once by app/(app)/layout.tsx, which already reads the Traveller
 * from the DB. Lets the chrome that renders below it without its own access
 * to that data — the Dock's account menu (inside and outside a Trip), the
 * trip layout's sidebar, and the boundary shells above the trip layout —
 * show the same Traveller without querying again.
 */
export function ShellUserProvider({ value, children }: { value: ShellUser; children: React.ReactNode }) {
  return <ShellUserContext.Provider value={value}>{children}</ShellUserContext.Provider>;
}

/** Null outside the provider (a component rendered on its own in a test). */
export function useShellUser(): ShellUser | null {
  return React.useContext(ShellUserContext);
}
