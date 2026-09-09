"use client";

/**
 * Which Trip is on screen, for stamping onto a Feedback note.
 *
 * The Feedback panel lives in the app shell; the trip name is only known two
 * layouts below it, so context can't reach upward. A tiny external store does.
 */

export type CurrentTrip = { tripId: string; tripName: string };

let current: CurrentTrip | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function setCurrentTrip(trip: CurrentTrip): void {
  current = trip;
  notify();
}

export function clearCurrentTrip(): void {
  current = null;
  notify();
}

export function subscribeToCurrentTrip(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCurrentTrip(): CurrentTrip | null {
  return current;
}

/** The server never has a current trip — keeps useSyncExternalStore SSR-safe. */
export function getCurrentTripServerSnapshot(): CurrentTrip | null {
  return null;
}
