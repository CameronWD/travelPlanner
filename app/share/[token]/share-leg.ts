import type { TransportMode } from "@/lib/enum-values";
import { formatDayLabel } from "@/lib/dates";
import { transportTimeDisplay } from "@/lib/time-display";
import { wallClock } from "./wall-clock";
import { durationMinutes, formatDuration } from "@/lib/transport";

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
