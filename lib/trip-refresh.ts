export const TRIP_REFRESH_EVENT = "teepee:trip-refresh";
export const RESUME_REFRESH_AFTER_MS = 5 * 60 * 1000;

export function requestTripRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TRIP_REFRESH_EVENT));
}
