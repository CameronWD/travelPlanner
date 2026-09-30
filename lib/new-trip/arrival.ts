/** Set by New trip right before it navigates to trip home; read once there (MOTION N13). */
export const ARRIVAL_KEY = "teepee:trip-arrival";

export function markArrival(tripId: string): void {
  try {
    sessionStorage.setItem(ARRIVAL_KEY, tripId);
  } catch {
    // No storage: trip home just skips the drop-in.
  }
}

export function takeArrival(tripId: string): boolean {
  try {
    if (sessionStorage.getItem(ARRIVAL_KEY) !== tripId) return false;
    sessionStorage.removeItem(ARRIVAL_KEY);
    return true;
  } catch {
    return false;
  }
}
