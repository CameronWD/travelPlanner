import { findOutboundLeg, findReturnLeg } from "@/lib/home-base";
import { formatDuration } from "@/lib/transport";

export interface ConnectionLeg {
  id: string; mode: string;
  depPlace?: string | null; arrPlace?: string | null;
  depPlaceId?: string | null; arrPlaceId?: string | null;
  depAt?: Date | null; arrAt?: Date | null;
  fromStopId?: string | null; toStopId?: string | null;
  depIsHome?: boolean | null; arrIsHome?: boolean | null;
  reference?: string | null;
}

const MINUTE = 60_000;
const DAY_MINUTES = 1440;

const norm = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export function meetingPlace(a: ConnectionLeg, b: ConnectionLeg): string | null {
  const place = a.arrPlace?.trim();
  if (!place) return null;
  if (norm(place) === norm(b.depPlace)) return place;
  if (a.arrPlaceId && a.arrPlaceId === b.depPlaceId) return place;
  return null;
}

export function isConnection(a: ConnectionLeg, b: ConnectionLeg): boolean {
  if (meetingPlace(a, b) === null || a.toStopId || a.arrIsHome || b.fromStopId || b.depIsHome) return false;
  return !a.arrAt || !b.depAt || waitMinutes(a, b) !== null;
}

export function waitMinutes(a: ConnectionLeg, b: ConnectionLeg): number | null {
  if (!a.arrAt || !b.depAt) return null;
  const minutes = Math.round((b.depAt.getTime() - a.arrAt.getTime()) / MINUTE);
  return minutes < 0 || minutes >= DAY_MINUTES ? null : minutes;
}

export function changeLabel(a: ConnectionLeg, b: ConnectionLeg): string | null {
  const raw = meetingPlace(a, b);
  if (!raw) return null;
  const place = raw.replace(/\s*\([^()]*\)\s*$/, "") || raw;
  const head = a.mode === "FLIGHT" && b.mode === "FLIGHT" ? `Layover in ${place}` : `Change at ${place}`;
  const wait = waitMinutes(a, b);
  return wait === null ? head : `${head} · ${formatDuration(wait)}`;
}

export function changeLabels(legs: readonly ConnectionLeg[]): (string | null)[] {
  return legs.map((leg, i) => (i === 0 ? null : changeLabel(legs[i - 1], leg)));
}

export function sameBooking(a: ConnectionLeg, b: ConnectionLeg): boolean {
  const ref = norm(a.reference);
  return ref !== "" && ref === norm(b.reference) && isConnection(a, b);
}

const byDeparture = (x: ConnectionLeg, y: ConnectionLeg) => {
  const tx = x.depAt?.getTime() ?? Infinity;
  const ty = y.depAt?.getTime() ?? Infinity;
  if (tx !== ty) return tx < ty ? -1 : 1;
  return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
};

export function bookingPartners<T extends ConnectionLeg>(legs: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const leg of [...legs].sort(byDeparture)) {
    const ref = norm(leg.reference);
    if (ref) groups.set(ref, [...(groups.get(ref) ?? []), leg]);
  }
  const partners = new Map<string, T[]>();
  for (const group of groups.values()) {
    const successor = (leg: T) => group.find((n) => n !== leg && sameBooking(leg, n));
    const entered = new Set(group.map(successor));
    for (const start of group.filter((l) => !entered.has(l))) {
      const chain: T[] = [start];
      for (let n = successor(start); n && !chain.includes(n); n = successor(n)) chain.push(n);
      if (chain.length < 2) continue;
      for (const leg of chain) partners.set(leg.id, chain.filter((l) => l !== leg));
    }
  }
  return partners;
}

export function journeyHome<T extends ConnectionLeg>(legs: readonly T[], lastStopId: string | null): T[] {
  const first = findReturnLeg(legs, lastStopId);
  if (!first) return [];
  const journey: T[] = [first];
  for (;;) {
    const last = journey[journey.length - 1];
    const next = legs
      .filter((n) => !journey.includes(n) && isConnection(last, n))
      .filter((n) => !last.arrAt || !n.depAt || n.depAt >= last.arrAt)
      .sort(byDeparture)[0];
    if (!next) return journey;
    journey.push(next);
  }
}

export function journeyOut<T extends ConnectionLeg>(legs: readonly T[], firstStopId: string | null): T[] {
  const last = findOutboundLeg(legs, firstStopId);
  if (!last) return [];
  const journey: T[] = [last];
  for (;;) {
    const head = journey[0];
    const prev = legs
      .filter((p) => !journey.includes(p) && isConnection(p, head))
      .filter((p) => !p.arrAt || !head.depAt || p.arrAt <= head.depAt)
      .sort((x, y) => (y.arrAt?.getTime() ?? -Infinity) - (x.arrAt?.getTime() ?? -Infinity))[0];
    if (!prev) return journey;
    journey.unshift(prev);
  }
}
