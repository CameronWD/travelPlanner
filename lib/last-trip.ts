/** The "Back to" trip (spec P1): the most recently opened, if still one of the viewer's trips; else the first in trips-list order. Pure. */
export const LAST_TRIP_COOKIE = "teepee-last-trip";

export function pickLastTrip<T extends { id: string }>(trips: T[], cookieId: string | null | undefined): T | null {
  if (trips.length === 0) return null;
  return (cookieId && trips.find((t) => t.id === cookieId)) || trips[0];
}
