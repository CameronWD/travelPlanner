export type MapsConfig = { apiKey: string; mapId: string };

export function mapsConfig(): MapsConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
  return apiKey && mapId ? { apiKey, mapId } : null;
}

export function placesBrowserKey(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || null;
}
