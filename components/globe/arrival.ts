/** Constants + toast copy for the Globe's `?added=<tripId>` arrival (Task 15). */

export const ARRIVAL_FLY_S = 0.8;
export const PIN_STAGGER_MS = 60;

export function arrivalToastTitle(n: number): string {
  if (n <= 0) return "Added to your map";
  return `Added to your map · ${n} ${n === 1 ? "place" : "places"}`;
}
