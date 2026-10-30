import { estimateDriveMinutes, haversineKm } from "@/lib/geo";
import { zonedWallTimeToInstant } from "@/lib/tz";

export type Pt = { lat: number; lng: number };
export type LocalMode = "DRIVE" | "TRANSIT";
export type TravelMode = "WALK" | LocalMode;
export type TravelTimeStatus = "OK" | "NONE" | "ERROR";

export type HopItem = {
  id: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  sortOrder: number;
  lat: number | null;
  lng: number | null;
  stopId: string | null;
};

export type TravelLookup = Map<
  string,
  { status: TravelTimeStatus; minutes: number | null; distanceM: number | null; polyline: string | null }
>;

export type ResolvedHop = {
  minutes: number;
  distanceKm: number;
  mode: "walk" | "drive" | "transit";
  estimated: boolean;
  polyline: string | null;
};

const WALK_ROW_UNDER_KM = 2;
const MAX_REAL_WALK_MIN = 20;
const ESTIMATE_WALK_KMH = 4.5;
const ESTIMATE_MAX_WALK_MIN = 30;
const TRANSIT_SLOT_MS = 15 * 60_000;

export function pointKey(p: Pt): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

function routeKey(mode: TravelMode, from: Pt, to: Pt, departure?: Date): string {
  const base = `${mode}|${pointKey(from)}|${pointKey(to)}`;
  if (mode !== "TRANSIT" || !departure) return base;
  const slot = new Date(Math.floor(departure.getTime() / TRANSIT_SLOT_MS) * TRANSIT_SLOT_MS);
  return `${base}|${slot.toISOString()}`;
}

export function effectiveLocalMode(
  stop: { id: string; localTravelMode: string | null },
  transports: { mode: string; fromStopId: string | null; toStopId: string | null }[],
): LocalMode {
  if (stop.localTravelMode === "DRIVE" || stop.localTravelMode === "TRANSIT") return stop.localTravelMode;
  const drives = transports.some(
    (t) => t.mode === "CAR" && (t.fromStopId === stop.id || t.toStopId === stop.id),
  );
  return drives ? "DRIVE" : "TRANSIT";
}

function located(lat: number | null | undefined, lng: number | null | undefined): Pt | null {
  return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function hhmmToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function dayHops(items: HopItem[]): { from: HopItem; to: HopItem }[] {
  const byDate = new Map<string, HopItem[]>();
  for (const it of items) {
    if (!it.date || !located(it.lat, it.lng)) continue;
    const day = byDate.get(it.date) ?? [];
    day.push(it);
    byDate.set(it.date, day);
  }

  const hops: { from: HopItem; to: HopItem }[] = [];
  for (const day of byDate.values()) {
    const dayMapOrder = [...day].sort((a, b) => {
      const ta = a.startTime ?? "99:99";
      const tb = b.startTime ?? "99:99";
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });
    const timedOrder = day
      .filter((it) => it.startTime && it.endTime)
      .sort((a, b) => hhmmToMin(a.startTime!) - hhmmToMin(b.startTime!));

    const seen = new Set<string>();
    for (const order of [dayMapOrder, timedOrder]) {
      for (let i = 1; i < order.length; i++) {
        const id = `${order[i - 1].id}|${order[i].id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        hops.push({ from: order[i - 1], to: order[i] });
      }
    }
  }
  return hops;
}

export function transportEnds(
  t: {
    mode: string;
    fromStopId: string | null;
    toStopId: string | null;
    depLat?: number | null;
    depLng?: number | null;
    arrLat?: number | null;
    arrLng?: number | null;
    depIsHome?: boolean;
    arrIsHome?: boolean;
  },
  stopsById: Map<string, { lat?: number | null; lng?: number | null }>,
  home: Pt | null,
): { from: Pt; to: Pt } | null {
  if (t.mode !== "CAR") return null;
  const end = (lat: number | null | undefined, lng: number | null | undefined, stopId: string | null, isHome?: boolean) => {
    const row = located(lat, lng);
    if (row) return row;
    if (isHome) return home;
    const stop = stopId ? stopsById.get(stopId) : undefined;
    return stop ? located(stop.lat, stop.lng) : null;
  };
  const from = end(t.depLat, t.depLng, t.fromStopId, t.depIsHome);
  const to = end(t.arrLat, t.arrLng, t.toStopId, t.arrIsHome);
  return from && to ? { from, to } : null;
}

export function hopKeys(from: Pt, to: Pt, localMode: LocalMode, departure: Date | null, now: Date): string[] {
  const keys: string[] = [];
  if (haversineKm(from, to) < WALK_ROW_UNDER_KM) keys.push(routeKey("WALK", from, to));
  if (localMode === "DRIVE") keys.push(routeKey("DRIVE", from, to));
  else if (departure && departure.getTime() >= now.getTime()) keys.push(routeKey("TRANSIT", from, to, departure));
  return keys;
}

export function resolveHop(
  from: Pt,
  to: Pt,
  localMode: LocalMode,
  departure: Date | null,
  lookup: TravelLookup,
  estimateOpts: { windingFactor: number; avgSpeedKph: number },
): ResolvedHop {
  const km = haversineKm(from, to);
  const real = (key: string, mode: ResolvedHop["mode"]): ResolvedHop | null => {
    const row = lookup.get(key);
    if (row?.status !== "OK" || row.minutes == null) return null;
    const distanceKm = row.distanceM != null ? row.distanceM / 1000 : km;
    return { minutes: row.minutes, distanceKm, mode, estimated: false, polyline: row.polyline };
  };

  if (km < WALK_ROW_UNDER_KM) {
    const walk = real(routeKey("WALK", from, to), "walk");
    if (walk && walk.minutes <= MAX_REAL_WALK_MIN) return walk;
  }
  const local =
    localMode === "DRIVE"
      ? real(routeKey("DRIVE", from, to), "drive")
      : departure
        ? real(routeKey("TRANSIT", from, to, departure), "transit")
        : null;
  if (local) return local;

  const walkMin = (km / ESTIMATE_WALK_KMH) * 60;
  return walkMin <= ESTIMATE_MAX_WALK_MIN
    ? { minutes: walkMin, distanceKm: km, mode: "walk", estimated: true, polyline: null }
    : { minutes: estimateDriveMinutes(km, estimateOpts), distanceKm: km, mode: "drive", estimated: true, polyline: null };
}

export function itemDeparture(item: HopItem, stopTimezone: string): Date | null {
  if (!item.date || !item.endTime) return null;
  const at = zonedWallTimeToInstant(item.date, item.endTime, stopTimezone);
  return Number.isNaN(at.getTime()) ? null : at;
}
