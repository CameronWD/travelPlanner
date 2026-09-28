/**
 * Trip colour (CONTEXT.md): the hue a Trip is drawn in wherever a
 * Traveller's Trips sit side by side. Handed out from the ramp in the order
 * the Traveller's Trips were created, so a Trip keeps its colour for life and
 * the first eight never collide (spec D2). Derived, never stored. Pure.
 */
import type { Hue } from "@/lib/hues";

/** Coral first so the oldest (usually the Up-next) trip reads as the app's own colour. No stone. */
export const TRIP_HUE_RAMP: readonly Hue[] = ["coral", "teal", "leaf", "lilac", "sun", "sky", "pink", "indigo"];

export function assignTripHues(trips: { id: string; createdAt: Date }[]): Map<string, Hue> {
  const ordered = [...trips].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const out = new Map<string, Hue>();
  ordered.forEach((t, i) => out.set(t.id, TRIP_HUE_RAMP[i % TRIP_HUE_RAMP.length]));
  return out;
}
