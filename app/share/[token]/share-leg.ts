import type { TransportMode } from "@/lib/enum-values";
import { formatDayLabel } from "@/lib/dates";
import { transportTimeDisplay } from "@/lib/time-display";
import { wallClock } from "./wall-clock";
import { durationMinutes, formatDuration } from "@/lib/transport";
import { changeLabels, journeyBetween, journeyHome, journeyOut } from "@/lib/connections";
import { MODE_LABELS } from "./share-rows";

export interface ShareLegInput {
  mode: TransportMode;
  depPlace: string | null;
  arrPlace: string | null;
  depAt: Date | null;
  arrAt: Date | null;
  serviceNumber: string | null;
}

export interface ShareLeg {
  mode: TransportMode;
  label: string;
  /** The day, the route with its times and day marker, and the duration. */
  when: string;
  /** The flight or train number, for those two modes only. */
  number: string | null;
  /**
   * The arrival instant and its local date and time as one string, for the
   * viewer's own-time check. Never a zone name: a Home end's zone is the Trip's
   * Home timezone, which a public link must not carry.
   */
  arrivesAt: string | null;
  arrivesLocal: string | null;
}

/** The only Travel detail a public link carries, and only for a mode people follow by its number. */
const NUMBERED: readonly TransportMode[] = ["FLIGHT", "TRAIN"];

/** `hide*` leaves an end's place out, keeping its time: a Home end is never named on a public link. */
export function buildShareLeg(
  t: ShareLegInput,
  zones: { dep: string; arr: string },
  label: string,
  hide: { hideDepPlace?: boolean; hideArrPlace?: boolean } = {},
): ShareLeg {
  const { dep, arr, dayDelta } = transportTimeDisplay({
    depAt: t.depAt,
    arrAt: t.arrAt,
    fromTimezone: zones.dep,
    toTimezone: zones.arr,
  });
  const plus = dep && arr && dayDelta !== 0 ? ` ${dayDelta > 0 ? "+" : "−"}${Math.abs(dayDelta)}` : "";
  const from = [hide.hideDepPlace ? null : t.depPlace, dep?.time].filter(Boolean).join(" ");
  const to = [hide.hideArrPlace ? null : t.arrPlace, arr?.time].filter(Boolean).join(" ");
  const route = from && to ? `${from} → ${to}${plus}` : from || to;
  const minutes = durationMinutes(t.depAt, t.arrAt);
  const number = NUMBERED.includes(t.mode) ? t.serviceNumber?.trim() : null;
  const when = [dep ? formatDayLabel(dep.dateISO) : null, route || null, minutes ? formatDuration(minutes) : null]
    .filter(Boolean)
    .join(" · ");
  return { mode: t.mode, label, when, number: number || null, arrivesAt: t.arrAt ? new Date(t.arrAt).toISOString() : null, arrivesLocal: t.arrAt ? wallClock(new Date(t.arrAt), zones.arr) : null };
}

export interface ShareLegStack {
  legs: ShareLeg[];
  changeovers: (string | null)[];
}

export interface ShareTransportRow extends ShareLegInput {
  id: string;
  fromStopId: string | null;
  toStopId: string | null;
  depIsHome: boolean | null;
  arrIsHome: boolean | null;
  depPlaceId: string | null;
  arrPlaceId: string | null;
  depTimezone: string | null;
  arrTimezone: string | null;
}

interface ShareRouteContext {
  stops: readonly { id: string; name: string; timezone: string | null }[];
  homeTimezone: string | null;
  zone: string;
}

export interface ShareRouteLegs {
  out: ShareLegStack | null;
  between: (ShareLegStack | null)[];
  back: ShareLegStack | null;
}

function shareJourneyLeg(t: ShareTransportRow, ctx: ShareRouteContext): ShareLeg {
  const stop = (id: string | null) => ctx.stops.find((s) => s.id === id);
  const own = (isHome: boolean | null, stopId: string | null, placeZone: string | null) =>
    (isHome ? ctx.homeTimezone : (stop(stopId)?.timezone ?? placeZone)) ?? null;
  const dep = own(t.depIsHome, t.fromStopId, t.depTimezone);
  const arr = own(t.arrIsHome, t.toStopId, t.arrTimezone);
  const word = MODE_LABELS[t.mode] ?? "Transport";
  return buildShareLeg(
    t,
    { dep: dep ?? arr ?? ctx.zone, arr: arr ?? dep ?? ctx.zone },
    t.arrIsHome ? `${word} home` : `${word} to ${stop(t.toStopId)?.name ?? t.arrPlace}`,
    { hideDepPlace: Boolean(t.depIsHome), hideArrPlace: Boolean(t.arrIsHome) },
  );
}

function legsBetween<T extends ShareTransportRow>(legs: readonly T[], fromStopId: string, toStopId: string): T[] {
  const direct = legs.find((t) => t.fromStopId === fromStopId && t.toStopId === toStopId);
  return direct ? [direct] : journeyBetween(legs, fromStopId, toStopId);
}

export function shareRouteLegs(rows: readonly ShareTransportRow[], ctx: ShareRouteContext): ShareRouteLegs {
  // One booking is not a public notion: no rule here reads a reference.
  const legs = rows.map((t) => ({ ...t, reference: null }));
  const stack = (journey: readonly ShareTransportRow[]): ShareLegStack | null =>
    journey.length ? { legs: journey.map((t) => shareJourneyLeg(t, ctx)), changeovers: changeLabels(journey) } : null;
  const ids = ctx.stops.map((s) => s.id);
  const out = journeyOut(legs, ids[0] ?? null);
  const back = journeyHome(legs, ids.at(-1) ?? null);
  // Listed only when the far end is flagged Home, so an unflagged address is never printed as one.
  return {
    out: out[0]?.depIsHome ? stack(out) : null,
    between: ids.slice(1).map((to, i) => stack(legsBetween(legs, ids[i], to))),
    back: back.at(-1)?.arrIsHome ? stack(back) : null,
  };
}
