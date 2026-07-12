export interface HomeMapPoint { name: string; lat: number; lng: number }

export function homeMapPoint(trip: {
  homeName: string | null;
  homeLat: number | null;
  homeLng: number | null;
}): HomeMapPoint | null {
  if (!trip.homeName || trip.homeLat == null || trip.homeLng == null) return null;
  return { name: trip.homeName, lat: trip.homeLat, lng: trip.homeLng };
}
