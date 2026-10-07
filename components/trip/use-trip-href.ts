"use client";

import * as React from "react";
import type { Route } from "next";
import { useShellUser } from "@/components/shell/shell-user";
import { tripPath } from "@/lib/trip-path";

/**
 * A Trip's URL ref for client-side links (ADR 0064): its slug from the app
 * shell's trip list (app/(app)/layout.tsx loads every trip the viewer is on),
 * or the id when the list does not have it — a test with no provider, or a
 * Trip created in another tab. An id still works: the proxy redirects it.
 */
export function useTripSlug(tripId: string): string {
  const shell = useShellUser();
  return shell?.trips.find((t) => t.id === tripId)?.slug ?? tripId;
}

/** `tripPath` bound to a Trip's current ref: `useTripHref(tripId)("/plan")`. */
export function useTripHref(tripId: string): (sub?: string) => Route {
  const ref = useTripSlug(tripId);
  return React.useCallback((sub = "") => tripPath(ref, sub), [ref]);
}

/**
 * The inverse of useTripSlug (Task 10 extra requirement (b)/(c)): a route
 * segment read off `usePathname()`/`useParams()` may now be a slug rather
 * than the Trip's id (ADR 0064), so anything that needs the real id back —
 * stamping a Feedback note, calling a server action that queries by id —
 * must resolve it first. Looks the ref up as a slug in the shell's trip
 * list; when it isn't one there (already an id, a Trip missing from the
 * list, or no provider) the ref is handed back unchanged, since a bare id
 * is exactly what it would have been before slugs existed. `null` in,
 * `null` out — nothing to resolve when there's no route segment.
 */
export function useTripIdFromRef(ref: string | null): string | null {
  const shell = useShellUser();
  if (ref == null) return null;
  return shell?.trips.find((t) => t.slug === ref)?.id ?? ref;
}
