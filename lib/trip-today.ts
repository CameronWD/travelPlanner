/**
 * One Trip-local "today" (final review #12).
 *
 * "What day is it on this Trip?" is answered in the Trip's reference
 * timezone — the zone of the Stop the Trip is currently at
 * (`currentTripTimezone`) — over the real plan's Stops in canonical plan
 * order (ADR 0038, `orderPlanStops`). Every surface that needs the Trip's
 * today (trip layout, Home, Travelling Home, the Journal window, checklists,
 * Your travels) calls this, so they can't disagree about the date — e.g. by
 * one site skipping `orderPlanStops` and picking a different "current" Stop,
 * or by falling back to UTC.
 *
 * Plain lib module: pure apart from reading the clock.
 */

import { orderPlanStops, type OrderableStop } from "@/lib/plan-order";
import { currentTripTimezone, todayISOInZone } from "@/lib/tz";

export interface TripTodayStop extends OrderableStop {
  timezone: string | null;
}

/** The Trip's own "today" (YYYY-MM-DD). Pass the real plan's Stops in sortOrder order; rough Stops are ignored. */
export function tripTodayISO(stops: readonly TripTodayStop[]): string {
  return todayISOInZone(currentTripTimezone(orderPlanStops(stops)));
}
