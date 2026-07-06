import type { MarkerView } from "@/components/globe/types";

export interface MarkerFilter {
  category: string | null;
  country: string | null;
  query: string;
}

const UNPINNED = "Unpinned";

/** Apply category + country + free-text filters (all optional / ANDed). */
export function filterMarkers(markers: MarkerView[], filter: MarkerFilter): MarkerView[] {
  const q = filter.query.trim().toLowerCase();
  return markers.filter((mk) => {
    if (filter.category && mk.category !== filter.category) return false;
    if (filter.country && mk.country !== filter.country) return false;
    if (q) {
      const hay = [mk.title, mk.city, mk.country].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Group by country A→Z; markers with no country fall under "Unpinned", last. */
export function groupMarkersByCountry(
  markers: MarkerView[],
): Array<{ country: string; markers: MarkerView[] }> {
  const byCountry = new Map<string, MarkerView[]>();
  for (const mk of markers) {
    const key = mk.country ?? UNPINNED;
    const arr = byCountry.get(key) ?? [];
    arr.push(mk);
    byCountry.set(key, arr);
  }
  return [...byCountry.entries()]
    .sort(([a], [b]) => {
      if (a === UNPINNED) return 1;
      if (b === UNPINNED) return -1;
      return a.localeCompare(b);
    })
    .map(([country, list]) => ({ country, markers: list }));
}

/** Sorted, unique, non-null country names (for the country filter dropdown). */
export function distinctCountries(markers: MarkerView[]): string[] {
  return [...new Set(markers.map((m) => m.country).filter((c): c is string => c !== null))].sort(
    (a, b) => a.localeCompare(b),
  );
}
