/**
 * Route sketch geometry (TRIP_COVER.md §3; spec P2). Groups a Trip's located
 * Stops with the shared single-linkage clustering (lib/geo-cluster.ts, 1500
 * km), picks the **main cluster** by most nights (tie: most stops, then
 * earliest), projects it into a box, and samples dots. The Home base is
 * excluded by the caller. Pure.
 */
import { clusterStops, haversineKm } from "@/lib/geo-cluster";

export interface SketchStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  nights: number;
}

export interface MainCluster<T> {
  main: T[];
  offFrame: T[];
}

const SAME_CITY_KM = 5;
const MAX_DOTS = 14;

/**
 * Picks the main cluster from located stops (non-NaN coordinates only).
 * Unlocated stops (NaN or non-finite lat/lng) are not clustered and not returned;
 * they are silently excluded from both main and offFrame.
 */
export function pickMainCluster<T extends SketchStop>(stops: T[]): MainCluster<T> | null {
  const located = stops.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  const clusters = clusterStops(located);
  if (clusters.length === 0) return null;
  const index = new Map(located.map((s, i) => [s.id, i]));
  const nights = (c: T[]) => c.reduce((n, s) => n + s.nights, 0);
  const earliest = (c: T[]) => Math.min(...c.map((s) => index.get(s.id) ?? 0));
  const best = [...clusters].sort((a, b) => nights(b) - nights(a) || b.length - a.length || earliest(a) - earliest(b))[0];
  if (best.length < 2) return null;
  const mainIds = new Set(best.map((s) => s.id));
  const main = located.filter((s) => mainIds.has(s.id)); // itinerary order
  const offFrame = located.filter((s) => !mainIds.has(s.id));
  return { main, offFrame };
}

export interface Box {
  w: number;
  h: number;
  /** Fraction of each side kept clear, e.g. 0.12. */
  pad: number;
}
export interface Point {
  x: number;
  y: number;
}

/** Equirectangular with x scaled by cos(mean lat); uniform scale, centred on the unused axis. */
export function projectToBox(points: { lat: number; lng: number }[], box: Box): Point[] {
  if (points.length === 0) return [];
  const meanLat = points.reduce((a, p) => a + p.lat, 0) / points.length;
  const kx = Math.cos((meanLat * Math.PI) / 180);
  const raw = points.map((p) => ({ x: p.lng * kx, y: -p.lat }));
  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  if (maxX - minX < 1e-9 && maxY - minY < 1e-9) return points.map(() => ({ x: box.w / 2, y: box.h / 2 }));
  const innerW = box.w * (1 - 2 * box.pad);
  const innerH = box.h * (1 - 2 * box.pad);
  const spanX = maxX - minX || 1e-9;
  const spanY = maxY - minY || 1e-9;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const usedW = spanX * scale;
  const usedH = spanY * scale;
  const offX = box.w * box.pad + (innerW - usedW) / 2;
  const offY = box.h * box.pad + (innerH - usedH) / 2;
  return raw.map((p) => ({
    x: Math.round(((p.x - minX) * scale + offX) * 100) / 100,
    y: Math.round(((p.y - minY) * scale + offY) * 100) / 100,
  }));
}

/** At most `max` dot indices: first, last, and evenly sampled between. */
export function sampleDotIndices(count: number, max: number = MAX_DOTS): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const out = new Set<number>([0, count - 1]);
  const inner = max - 2;
  for (let k = 1; k <= inner; k++) out.add(Math.round((k * (count - 1)) / (inner + 1)));
  return [...out].sort((a, b) => a - b).slice(0, max);
}

export interface SketchModel {
  points: Point[];
  dotIndices: number[];
  /** "London → Rome" */
  caption: string;
  /** "+ Bali", "+ Bali +2", or null. */
  chip: string | null;
  first: string;
  last: string;
}

function allWithin(stops: SketchStop[], km: number): boolean {
  for (let i = 0; i < stops.length; i++)
    for (let j = i + 1; j < stops.length; j++) if (haversineKm(stops[i], stops[j]) > km) return false;
  return true;
}

export function sketchModel(stops: SketchStop[], box: Box): SketchModel | null {
  const picked = pickMainCluster(stops);
  if (!picked) return null;
  if (allWithin(picked.main, SAME_CITY_KM)) return null;
  const { main, offFrame } = picked;
  const points = projectToBox(main, box);
  const chip = offFrame.length === 0 ? null : offFrame.length === 1 ? `+ ${offFrame[0].name}` : `+ ${offFrame[0].name} +${offFrame.length - 1}`;
  return {
    points,
    dotIndices: sampleDotIndices(points.length),
    caption: `${main[0].name} → ${main[main.length - 1].name}`,
    chip,
    first: main[0].name,
    last: main[main.length - 1].name,
  };
}
