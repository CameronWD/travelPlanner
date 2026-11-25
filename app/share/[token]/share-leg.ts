import type { TransportMode } from "@/lib/enum-values";
import { formatDayLabel } from "@/lib/dates";
import { transportTimeDisplay } from "@/lib/time-display";
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
  line: string;
}

/** The only Travel detail a public link carries, and only for a mode people follow by its number. */
const NUMBERED: readonly TransportMode[] = ["FLIGHT", "TRAIN"];

export function buildShareLeg(t: ShareLegInput, zones: { dep: string; arr: string }, label: string): ShareLeg {
  const { dep, arr, dayDelta } = transportTimeDisplay({
    depAt: t.depAt,
    arrAt: t.arrAt,
    fromTimezone: zones.dep,
    toTimezone: zones.arr,
  });
  const plus = dep && arr && dayDelta !== 0 ? ` ${dayDelta > 0 ? "+" : "−"}${Math.abs(dayDelta)}` : "";
  const from = [t.depPlace, dep?.time].filter(Boolean).join(" ");
  const to = [t.arrPlace, arr?.time].filter(Boolean).join(" ");
  const route = from && to ? `${from} → ${to}${plus}` : from || to;
  const minutes = durationMinutes(t.depAt, t.arrAt);
  const number = NUMBERED.includes(t.mode) ? t.serviceNumber?.trim() : null;
  const line = [dep ? formatDayLabel(dep.dateISO) : null, route || null, minutes ? formatDuration(minutes) : null, number || null]
    .filter(Boolean)
    .join(" · ");
  return { mode: t.mode, label, line };
}
