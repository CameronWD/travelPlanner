"use client";

import * as React from "react";
import type { TravellerLike } from "@/lib/traveller";

/**
 * The signed-in Traveller as the app shell's chrome needs them: who they are
 * (avatar, name, email for the menu label), and whether the Admin entry and
 * its pending Access request badge show.
 */
export interface ShellUser {
  user: TravellerLike & { email: string | null };
  isAdmin: boolean;
  pendingAccessRequests: number;
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
