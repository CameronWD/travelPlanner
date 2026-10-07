import { addDays, daysBetween, formatDayLabel, formatLongDate, nightsBetween } from "@/lib/dates";
import type { TransportMode } from "@/lib/enum-values";
import { findOutboundLeg, findReturnLeg } from "@/lib/home-base";

export function dayHeading(dateISO: string, tripStart: string, tripEnd: string): string {
  const spansYears = tripStart.slice(0, 4) !== tripEnd.slice(0, 4);
  return spansYears && dateISO.slice(0, 4) !== tripStart.slice(0, 4) ? formatLongDate(dateISO) : formatDayLabel(dateISO);
}

export function dayEyebrow(i: { dayNumber: number; totalDays: number; chapterName: string | null; country: string | null; travelDay: boolean }): string {
  const head = `DAY ${i.dayNumber} OF ${i.totalDays}`;
  const tail = i.travelDay ? "TRAVEL DAY" : (i.chapterName ?? i.country);
  return tail ? `${head} · ${tail.toUpperCase()}` : head;
}

export interface SubLineInput { stopName: string | null; country: string | null; zone: string | null; nightOf: { night: number; of: number } | null; travel: { from: string; to: string; toZone: string | null } | null; compact: boolean }

export function daySubLine(i: SubLineInput): string {
  if (i.travel) {
    const zone = i.travel.toZone && i.zone && i.travel.toZone !== i.zone ? `${i.zone} → ${i.travel.toZone}` : (i.zone ?? i.travel.toZone);
    return [`${i.travel.from} → ${i.travel.to}`, zone].filter(Boolean).join(" · ");
  }
  if (!i.stopName) return "";
  const place = i.compact || !i.country ? i.stopName : `${i.stopName}, ${i.country}`;
  const night = i.nightOf ? `night ${i.nightOf.night} of ${i.nightOf.of}` : null;
  return [place, i.zone, night].filter(Boolean).join(" · ");
}

export function nightOfStay(dateISO: string, checkIn: string, checkOut: string): { night: number; of: number } | null {
  if (dateISO < checkIn || dateISO >= checkOut) return null;
  return { night: daysBetween(checkIn, dateISO) + 1, of: nightsBetween(checkIn, checkOut) };
}

/** Every calendar day of the Trip, start → end inclusive — the Day view strip shows them all (spec 2026-09-28 D1). */
export function tripDays(tripStart: string, tripEnd: string): string[] {
  const total = daysBetween(tripStart, tripEnd) + 1;
  return Array.from({ length: total }, (_, k) => addDays(tripStart, k));
}

export const dotsFor = (count: number) => Math.min(count, 3);

/**
 * The Day strip's stop line (spec 2026-09-29 D3): Home base → Stops → Home base.
 * Each day belongs to the Stop whose night it is; a Stop's depart day that is
 * nobody's night stays on that Stop (it is covered, not a Gap day). Any other
 * day is a Gap day, drawn as a dashed stretch labelled with the covering
 * Transport — the outbound leg before the first Stop, the return leg after the
 * last (lib/home-base.ts rule), else the leg between the neighbouring Stops.
 */
type StopLineSegment =
  | { kind: "stop"; name: string; startIndex: number; span: number; hueIndex: number }
  | { kind: "gap"; startIndex: number; span: number; mode: TransportMode | null; label: string | null };

export interface StopLine { homeStart: string | null; homeEnd: string | null; segments: StopLineSegment[] }
export interface LineStop { id: string; name: string; arriveDate: string; departDate: string; sortOrder: number }
export interface LineTransport {
  fromStopId: string | null;
  toStopId: string | null;
  depPlace: string | null;
  arrPlace: string | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  mode: TransportMode;
}

function coveringLeg(prev: LineStop | null, next: LineStop | null, transports: LineTransport[]): LineTransport | null {
  if (!prev && next) return findOutboundLeg(transports, next.id);
  if (prev && !next) return findReturnLeg(transports, prev.id);
  if (prev && next) {
    return (
      transports.find((t) => t.fromStopId === prev.id && t.toStopId === next.id) ??
      transports.find((t) => t.fromStopId === prev.id && !t.toStopId) ??
      transports.find((t) => !t.fromStopId && t.toStopId === next.id) ??
      null
    );
  }
  return null;
}

function legLabel(t: LineTransport, byId: Map<string, LineStop>, homeName: string | null): string | null {
  // Same endpoint precedence as the Transport card (components/trip/transport-card.tsx).
  const from = t.depIsHome ? homeName : ((t.fromStopId ? byId.get(t.fromStopId)?.name : null) ?? t.depPlace);
  const to = t.arrIsHome ? homeName : ((t.toStopId ? byId.get(t.toStopId)?.name : null) ?? t.arrPlace);
  if (from && to) return `${from} → ${to}`;
  return from ?? to ?? null;
}

export function stopLine(i: { days: string[]; stops: LineStop[]; transports: LineTransport[]; homeName: string | null; roundTrip: boolean }): StopLine {
  const sorted = [...i.stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const hue = new Map(sorted.map((s, k) => [s.id, k]));
  const byId = new Map(sorted.map((s) => [s.id, s]));
  const ownerOf = (d: string): LineStop | null => {
    const night = sorted
      .filter((s) => s.arriveDate <= d && d < s.departDate)
      .reduce<LineStop | null>((best, s) => (!best || s.arriveDate > best.arriveDate ? s : best), null);
    return night ?? sorted.find((s) => s.departDate === d) ?? null;
  };
  const owners = i.days.map(ownerOf);
  const segments: StopLineSegment[] = [];
  let k = 0;
  while (k < owners.length) {
    const o = owners[k];
    let end = k;
    while (end + 1 < owners.length && (owners[end + 1]?.id ?? null) === (o?.id ?? null)) end++;
    const span = end - k + 1;
    if (o) {
      segments.push({ kind: "stop", name: o.name, startIndex: k, span, hueIndex: hue.get(o.id) ?? 0 });
    } else {
      const prev = k > 0 ? owners[k - 1] : null;
      const next = end + 1 < owners.length ? owners[end + 1] : null;
      const leg = coveringLeg(prev, next, i.transports);
      segments.push({ kind: "gap", startIndex: k, span, mode: leg?.mode ?? null, label: leg ? legLabel(leg, byId, i.homeName) : null });
    }
    k = end + 1;
  }
  return { homeStart: i.homeName, homeEnd: i.homeName && i.roundTrip ? i.homeName : null, segments };
}

export const planCountLabel = (n: number) => (n === 0 ? "Nothing planned yet" : n === 1 ? "1 thing" : `${n} things`);

export interface IdeaRow { id: string; title: string; category: string; hint: string | null; pool: "todo" | "wishlist" }

function distanceHint(km: number): string { return km < 1 ? `≈${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`; }

export function dayIdeasRows(i: { stopName: string; thingsToDo: Array<{ id: string; title: string; category: string; startTime: string | null }>; wishlist: Array<{ id: string; title: string; category: string; distanceKm: number | null; reason: "nearby" | "country" | "unlocated" }>; limit?: number }): { rows: IdeaRow[]; all: IdeaRow[]; more: number; eyebrow: string | null } {
  const limit = i.limit ?? 3;
  const all: IdeaRow[] = [
    ...i.thingsToDo.map((t) => ({ id: t.id, title: t.title, category: t.category, hint: t.startTime ? `from ${t.startTime}` : null, pool: "todo" as const })),
    ...i.wishlist.map((w) => ({ id: w.id, title: w.title, category: w.category, hint: w.reason === "nearby" && w.distanceKm != null ? distanceHint(w.distanceKm) : w.reason === "country" ? "same country" : null, pool: "wishlist" as const })),
  ];
  const rows = all.slice(0, limit);
  if (rows.length === 0) return { rows, all, more: 0, eyebrow: null };
  const onlyWishlist = rows.every((r) => r.pool === "wishlist");
  const stop = i.stopName.toUpperCase();
  return { rows, all, more: all.length - rows.length, eyebrow: onlyWishlist ? `FROM YOUR WISHLIST IN ${stop}` : `IDEAS FOR ${stop}` };
}

export const forecastOpensOn = (dateISO: string) => formatDayLabel(addDays(dateISO, -15));
