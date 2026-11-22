import { allWithin, offFrameChip, pickMainCluster, SAME_CITY_KM, type SketchStop } from "@/lib/trips/route-sketch";

export interface RouteSnapshotPin {
  lat: number;
  lng: number;
  sortOrder: number;
  number: number;
}

export interface RouteSnapshotModel {
  pins: RouteSnapshotPin[];
  caption: string;
  chip: string | null;
}

export type SnapshotShape = "tall" | "square" | "band";

export const SNAPSHOT_SIZE: Record<SnapshotShape, { width: number; height: number }> = {
  tall: { width: 480, height: 640 },
  square: { width: 400, height: 400 },
  band: { width: 640, height: 360 },
};

export const MAX_SNAPSHOT_PINS = 30;

export function routeSnapshotModel(stops: SketchStop[]): RouteSnapshotModel | null {
  const picked = pickMainCluster(stops);
  if (!picked || allWithin(picked.main, SAME_CITY_KM)) return null;
  const { main, offFrame } = picked;
  const position = new Map(stops.map((s, i) => [s.id, i + 1]));
  return {
    pins: main.map((s) => ({ lat: s.lat, lng: s.lng, sortOrder: s.sortOrder, number: position.get(s.id)! })),
    caption: `${main[0].name} → ${main[main.length - 1].name}`,
    chip: offFrameChip(offFrame),
  };
}

const round4 = (n: number) => String(Math.round(n * 1e4) / 1e4);

export function encodeSnapshotPins(pins: RouteSnapshotPin[]): string {
  return pins.map((p) => `${round4(p.lat)},${round4(p.lng)},${p.sortOrder},${p.number}`).join(";");
}

export function decodeSnapshotPins(raw: string | null): RouteSnapshotPin[] | null {
  if (!raw) return null;
  const parts = raw.split(";");
  if (parts.length > MAX_SNAPSHOT_PINS) return null;
  const pins: RouteSnapshotPin[] = [];
  for (const part of parts) {
    const fields = part.split(",");
    if (fields.length !== 4 || fields.some((f) => f.trim() === "")) return null;
    const [lat, lng, sortOrder, number] = fields.map(Number);
    if (![lat, lng, sortOrder, number].every(Number.isFinite)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || !Number.isInteger(number) || number < 0) return null;
    pins.push({ lat, lng, sortOrder, number });
  }
  return pins;
}

export function routeSnapshotPath(tripId: string, model: RouteSnapshotModel, shape: SnapshotShape): string {
  return `/api/trips/${tripId}/route-snapshot?shape=${shape}&p=${encodeURIComponent(encodeSnapshotPins(model.pins))}`;
}
