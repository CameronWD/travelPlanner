import { addDays, isRealCalendarDate } from "@/lib/dates";
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

// Items are read in this order wherever hops are built: dayHops breaks equal start times by input order.
export const ITEM_HOP_ORDER = [{ date: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }, { id: "asc" }] as const;

const WALK_ROW_UNDER_KM = 2;
const MAX_REAL_WALK_MIN = 20;
const ESTIMATE_WALK_KMH = 4.5;
const ESTIMATE_MAX_WALK_MIN = 30;
const TRANSIT_SLOT_MS = 15 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const TRANSIT_WINDOW_MS = 90 * DAY_MS;
const MODES: readonly TravelMode[] = ["WALK", "DRIVE", "TRANSIT"];

function coord(n: number): string {
  return (Math.round(n * 1e5) / 1e5 + 0).toFixed(5);
}

export function pointKey(p: Pt): string {
  return `${coord(p.lat)},${coord(p.lng)}`;
}

function samePoint(from: Pt, to: Pt): boolean {
  return pointKey(from) === pointKey(to);
}

function routeKey(mode: TravelMode, from: Pt, to: Pt, departure?: Date): string {
  const base = `${mode}|${pointKey(from)}|${pointKey(to)}`;
  if (mode !== "TRANSIT" || !departure) return base;
  const slot = new Date(Math.floor(departure.getTime() / TRANSIT_SLOT_MS) * TRANSIT_SLOT_MS);
  return `${base}|${slot.toISOString()}`;
}

export function driveKey(from: Pt, to: Pt): string {
  return routeKey("DRIVE", from, to);
}

function parsePoint(raw: string): Pt | null {
  const parts = raw.split(",");
  if (parts.length !== 2 || parts.some((p) => p.trim() === "")) return null;
  const [lat, lng] = parts.map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function parseHopKey(key: string): { mode: TravelMode; from: Pt; to: Pt; departure: Date | null } | null {
  const [mode, fromRaw, toRaw, depRaw, ...rest] = key.split("|");
  const m = MODES.find((x) => x === mode);
  if (!m || rest.length > 0 || fromRaw === undefined || toRaw === undefined) return null;
  if ((m === "TRANSIT") !== (depRaw !== undefined)) return null;
  const from = parsePoint(fromRaw);
  const to = parsePoint(toRaw);
  if (!from || !to) return null;
  if (depRaw === undefined) return { mode: m, from, to, departure: null };
  const departure = new Date(depRaw);
  return Number.isNaN(departure.getTime()) ? null : { mode: m, from, to, departure };
}

export function effectiveLocalMode(
  stop: { id: string; localTravelMode: string | null },
  transports: { mode: string; fromStopId?: string | null; toStopId?: string | null }[],
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

type PlanTransport = { mode: string; fromStopId: string | null; toStopId: string | null };

export function planHops(items: HopItem[], planTransports: PlanTransport[]): { from: HopItem; to: HopItem }[] {
  // Rule 12 skips a pair on two Stops a Transport joins: changing place mid-day is that Transport's job.
  const joined = new Set<string>();
  for (const t of planTransports) {
    if (t.fromStopId && t.toStopId && t.fromStopId !== t.toStopId) {
      joined.add(`${t.fromStopId}|${t.toStopId}`);
      joined.add(`${t.toStopId}|${t.fromStopId}`);
    }
  }
  return dayHops(items).filter(
    ({ from, to }) => !(from.stopId && to.stopId && from.stopId !== to.stopId && joined.has(`${from.stopId}|${to.stopId}`)),
  );
}

export function hopInputs(
  pair: { from: HopItem; to: HopItem },
  ctx: {
    stopsById: Map<string, { id: string; localTravelMode: string | null; timezone: string | null; lat?: number | null; lng?: number | null }>;
    planTransports: PlanTransport[];
  },
): { from: Pt; to: Pt; localMode: LocalMode; departure: Date | null } | null {
  const from = located(pair.from.lat, pair.from.lng);
  const to = located(pair.to.lat, pair.to.lng);
  if (!from || !to) return null;
  const stop = pair.from.stopId ? ctx.stopsById.get(pair.from.stopId) : undefined;
  return {
    from,
    to,
    localMode: stop ? effectiveLocalMode(stop, ctx.planTransports) : "TRANSIT",
    departure: stop?.timezone ? itemDeparture(pair.from, stop.timezone) : null,
  };
}

export function carLegs<T extends Parameters<typeof transportEnds>[0] & { id: string }>(
  planTransports: T[],
  stopsById: Map<string, { lat?: number | null; lng?: number | null }>,
  home: Pt | null,
): { transportId: string; from: Pt; to: Pt }[] {
  return planTransports.flatMap((t) => {
    const ends = transportEnds(t, stopsById, home);
    return ends ? [{ transportId: t.id, ...ends }] : [];
  });
}

function transitBookable(departure: Date | null, now: Date): departure is Date {
  if (!departure) return false;
  const ahead = departure.getTime() - now.getTime();
  return ahead >= 0 && ahead <= TRANSIT_WINDOW_MS;
}

// "fetch" is the refresh asking Google (TRANSIT only inside its window); "read" loads any TRANSIT row already stored, so a past hop stays real.
export type KeyPurpose = "fetch" | "read";

export function hopKeys(
  from: Pt,
  to: Pt,
  localMode: LocalMode,
  departure: Date | null,
  now: Date,
  purpose: KeyPurpose = "fetch",
): string[] {
  if (samePoint(from, to)) return [];
  const keys: string[] = [];
  if (haversineKm(from, to) < WALK_ROW_UNDER_KM) keys.push(routeKey("WALK", from, to));
  if (localMode === "DRIVE") keys.push(routeKey("DRIVE", from, to));
  else if (departure && (purpose === "read" || transitBookable(departure, now))) keys.push(routeKey("TRANSIT", from, to, departure));
  return keys;
}

function realHop(lookup: TravelLookup, key: string, mode: ResolvedHop["mode"], km: number): ResolvedHop | null {
  const row = lookup.get(key);
  if (row?.status !== "OK" || row.minutes == null) return null;
  const distanceKm = row.distanceM != null ? row.distanceM / 1000 : km;
  return { minutes: row.minutes, distanceKm, mode, estimated: false, polyline: row.polyline };
}

function noRoute(mode: ResolvedHop["mode"]): ResolvedHop {
  return { minutes: 0, distanceKm: 0, mode, estimated: false, polyline: null };
}

export function resolveHop(
  from: Pt,
  to: Pt,
  localMode: LocalMode,
  departure: Date | null,
  lookup: TravelLookup,
  estimateOpts: { windingFactor: number; avgSpeedKph: number },
): ResolvedHop {
  if (samePoint(from, to)) return noRoute("walk");
  const km = haversineKm(from, to);
  const walk = km < WALK_ROW_UNDER_KM ? realHop(lookup, routeKey("WALK", from, to), "walk", km) : null;
  if (walk && walk.minutes <= MAX_REAL_WALK_MIN) return walk;
  const local =
    localMode === "DRIVE"
      ? realHop(lookup, routeKey("DRIVE", from, to), "drive", km)
      : departure
        ? realHop(lookup, routeKey("TRANSIT", from, to, departure), "transit", km)
        : null;
  if (local) return local;
  if (walk) return walk;

  const walkMin = (km / ESTIMATE_WALK_KMH) * 60;
  return walkMin <= ESTIMATE_MAX_WALK_MIN
    ? { minutes: walkMin, distanceKm: km, mode: "walk", estimated: true, polyline: null }
    : { minutes: estimateDriveMinutes(km, estimateOpts), distanceKm: km, mode: "drive", estimated: true, polyline: null };
}

export function resolveDriveLeg(
  from: Pt,
  to: Pt,
  lookup: TravelLookup,
  estimateOpts: { windingFactor: number; avgSpeedKph: number },
): ResolvedHop {
  if (samePoint(from, to)) return noRoute("drive");
  const km = haversineKm(from, to);
  return (
    realHop(lookup, driveKey(from, to), "drive", km) ?? {
      minutes: estimateDriveMinutes(km, estimateOpts),
      distanceKm: km,
      mode: "drive",
      estimated: true,
      polyline: null,
    }
  );
}

export type HopItemRow = {
  id: string;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  sortOrder?: number | null;
  lat?: number | null;
  lng?: number | null;
  stopId?: string | null;
};
export type HopStopRow = { id: string; localTravelMode?: string | null; timezone?: string | null; lat?: number | null; lng?: number | null };
export type HopTransportRow = {
  id: string;
  mode: string;
  fromStopId?: string | null;
  toStopId?: string | null;
  depLat?: number | null;
  depLng?: number | null;
  arrLat?: number | null;
  arrLng?: number | null;
  depIsHome?: boolean | null;
  arrIsHome?: boolean | null;
};

function nullsLast(a: string | null | undefined, b: string | null | undefined): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// ITEM_HOP_ORDER in JS, so a reader whose query orders Items differently still pairs ties as the refresh does.
export function byHopOrder(a: HopItemRow, b: HopItemRow): number {
  return (
    nullsLast(a.date, b.date) ||
    nullsLast(a.startTime, b.startTime) ||
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
    nullsLast(a.id, b.id)
  );
}

export function toHopItem(it: HopItemRow): HopItem {
  return {
    id: it.id,
    date: it.date ?? null,
    startTime: it.startTime ?? null,
    endTime: it.endTime ?? null,
    sortOrder: it.sortOrder ?? 0,
    lat: it.lat ?? null,
    lng: it.lng ?? null,
    stopId: it.stopId ?? null,
  };
}

export function hopStopsById(
  stops: HopStopRow[],
): Map<string, { id: string; localTravelMode: string | null; timezone: string | null; lat: number | null; lng: number | null }> {
  return new Map(
    stops.map((s) => [
      s.id,
      { id: s.id, localTravelMode: s.localTravelMode ?? null, timezone: s.timezone ?? null, lat: s.lat ?? null, lng: s.lng ?? null },
    ]),
  );
}

export function toPlanTransport(t: HopTransportRow) {
  return {
    id: t.id,
    mode: t.mode,
    fromStopId: t.fromStopId ?? null,
    toStopId: t.toStopId ?? null,
    depLat: t.depLat ?? null,
    depLng: t.depLng ?? null,
    arrLat: t.arrLat ?? null,
    arrLng: t.arrLng ?? null,
    depIsHome: t.depIsHome ?? false,
    arrIsHome: t.arrIsHome ?? false,
  };
}

export function homePointOf(trip: { homeLat?: number | null; homeLng?: number | null }): Pt | null {
  return trip.homeLat != null && trip.homeLng != null ? { lat: trip.homeLat, lng: trip.homeLng } : null;
}

export function planTravelKeys(
  plan: { items: HopItemRow[]; stops: HopStopRow[]; transports: HopTransportRow[]; home: Pt | null },
  now: Date,
  opts: { purpose?: KeyPurpose } = {},
): Set<string> {
  const stopsById = hopStopsById(plan.stops);
  const planTransports = plan.transports.map(toPlanTransport);
  const items = plan.items.map(toHopItem).sort(byHopOrder);
  const keys = new Set<string>();
  for (const pair of planHops(items, planTransports)) {
    const hop = hopInputs(pair, { stopsById, planTransports });
    if (hop) for (const k of hopKeys(hop.from, hop.to, hop.localMode, hop.departure, now, opts.purpose)) keys.add(k);
  }
  for (const leg of carLegs(planTransports, stopsById, plan.home)) {
    if (!samePoint(leg.from, leg.to)) keys.add(driveKey(leg.from, leg.to));
  }
  return keys;
}

export function itemDeparture(item: HopItem, stopTimezone: string): Date | null {
  if (!item.date || !item.endTime || !isRealCalendarDate(item.date)) return null;
  const overnight = item.startTime != null && hhmmToMin(item.endTime) < hhmmToMin(item.startTime);
  const at = zonedWallTimeToInstant(overnight ? addDays(item.date, 1) : item.date, item.endTime, stopTimezone);
  return Number.isNaN(at.getTime()) ? null : at;
}
