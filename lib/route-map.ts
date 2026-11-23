export interface HomeMapPoint { name: string; lat: number; lng: number }

export interface RouteMapStop {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  arriveDate: string;
  departDate: string;
  /** Stop order — pins and legs take the Stop's own colour (lib/stop-colours), the same as the calendar. */
  sortOrder: number;
  /** Display name of the chapter this stop belongs to. */
  chapterName?: string | null;
}

export function homeMapPoint(trip: {
  homeName: string | null;
  homeLat: number | null;
  homeLng: number | null;
}): HomeMapPoint | null {
  if (!trip.homeName || trip.homeLat == null || trip.homeLng == null) return null;
  return { name: trip.homeName, lat: trip.homeLat, lng: trip.homeLng };
}

export function stopsWithCoords(stops: RouteMapStop[]): (RouteMapStop & { lat: number; lng: number })[] {
  return stops.filter(
    (s): s is RouteMapStop & { lat: number; lng: number } =>
      typeof s.lat === "number" && typeof s.lng === "number" && !isNaN(s.lat) && !isNaN(s.lng),
  );
}

export function routeMapCanDraw(stops: RouteMapStop[]): boolean {
  return stopsWithCoords(stops).length >= 2;
}
