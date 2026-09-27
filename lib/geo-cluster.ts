/**
 * Geographic clustering of Stops, and continent/country chip labels.
 *
 * No framework, no network, no Prisma. Fully unit-testable.
 */

import { haversineKm } from "@/lib/geo";
import { countryName } from "@/lib/countries";
import { continentOf } from "@/lib/continents";

export { haversineKm };

export interface GeoPoint {
  id: string;
  lat: number;
  lng: number;
  countryCode?: string | null;
}

const DEFAULT_THRESHOLD_KM = 1500;

/**
 * Single-linkage clusters of points, joining any two points whose
 * great-circle distance is within `thresholdKm` (default 1500 km) —
 * transitively, so a chain of nearby points can span a wide area.
 *
 * Returns clusters largest-first; ties (equal size) are broken by which
 * cluster contains the earliest point in input order. Points without a
 * finite lat/lng are ignored entirely (they appear in no cluster).
 */
export function clusterStops<T extends GeoPoint>(
  points: T[],
  thresholdKm: number = DEFAULT_THRESHOLD_KM,
): T[][] {
  const valid: { point: T; index: number }[] = [];
  points.forEach((point, index) => {
    if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
      valid.push({ point, index });
    }
  });

  const n = valid.length;
  if (n === 0) return [];

  // Union-find for single-linkage clustering.
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const distance = haversineKm(valid[i].point, valid[j].point);
      if (distance <= thresholdKm) union(i, j);
    }
  }

  const groups = new Map<number, { point: T; index: number }[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(valid[i]);
    else groups.set(root, [valid[i]]);
  }

  const clusters = Array.from(groups.values());
  for (const cluster of clusters) cluster.sort((a, b) => a.index - b.index);

  clusters.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return a[0].index - b[0].index; // each cluster is already sorted by index
  });

  return clusters.map((cluster) => cluster.map((entry) => entry.point));
}

/**
 * Chip label for a cluster: the country name if every point shares one
 * countryCode, else the continent all share, else "Main route".
 */
export function clusterLabel(points: GeoPoint[]): string {
  if (points.length === 0) return "Main route";

  const codes = new Set(points.map((point) => point.countryCode?.toLowerCase() ?? null));
  if (codes.size === 1) {
    const [only] = codes;
    if (only) return countryName(only);
  }

  const continents = new Set(points.map((point) => continentOf(point.countryCode)));
  if (continents.size === 1) {
    const [only] = continents;
    if (only) return only;
  }

  return "Main route";
}
