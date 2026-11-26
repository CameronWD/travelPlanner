import type { LucideIcon } from "lucide-react";
import type { TransportMode } from "@/lib/enum-values";
import { TRANSPORT_MODE_META, durationMinutes, formatDuration } from "@/lib/transport";
import { transportDetailsLine, type TransportDetails } from "@/lib/transport-details";
import { transportTimeDisplay } from "@/lib/time-display";
import { endZones } from "@/lib/leg-zones";
import { formatDayLabel } from "@/lib/dates";
import { driveFit, planDriveLine, type DriveTime } from "@/lib/travel-times/drive-fit";

export interface LegTransport extends TransportDetails {
  mode: TransportMode;
  depPlace?: string | null;
  arrPlace?: string | null;
  depAt?: Date | null;
  arrAt?: Date | null;
  fromStopId?: string | null;
  toStopId?: string | null;
  depIsHome?: boolean | null;
  arrIsHome?: boolean | null;
  depTimezone?: string | null;
  arrTimezone?: string | null;
  reference?: string | null;
  driveEstimate?: { minutes: number; roadKm: number; estimated: boolean } | null;
  driveTime?: DriveTime | null;
}

export interface LegStop {
  id: string;
  name: string;
  timezone: string | null;
  arriveDate: string | null;
  departDate: string | null;
}

export interface LegLabel {
  icon: LucideIcon | null;
  label: string;
  sub: string;
  missing: boolean;
  accessibleName: string;
  arrival: string;
  detail: string;
  drive?: { text: string; tooShort: boolean };
}

const SPOKEN_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const spokenDay = (iso: string) => SPOKEN_DAY.format(new Date(`${iso}T00:00:00Z`));

/** PLAN.md §2: shorten a place to its IATA/station code when one is in it. */
export function placeCode(place: string): string {
  return /\b([A-Z]{3})\b/.exec(place)?.[1] ?? place;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const withoutRegion = (place: string, region: string) => {
  const m = /^(.*\S)\s*\(([^()]+)\)$/.exec(place.trim());
  return m && same(m[2], region) ? m[1] : place;
};

function sameRegion(a: string, b: string): [string, string] | string {
  if (same(a, b)) return a.trim();
  const [x, y] = [withoutRegion(a, b), withoutRegion(b, a)];
  if (same(x, y)) return x.trim();
  if (x !== a || y !== b) return [x, y];
  const [pa, pb] = [a.split(",").map((p) => p.trim()), b.split(",").map((p) => p.trim())];
  let shared = 0;
  while (
    shared < Math.min(pa.length, pb.length) - 1 &&
    same(pa[pa.length - 1 - shared], pb[pb.length - 1 - shared])
  ) {
    shared++;
  }
  if (shared === 0) return [a, b];
  const [ta, tb] = [pa.slice(0, pa.length - shared).join(", "), pb.slice(0, pb.length - shared).join(", ")];
  return same(ta, tb) ? ta : [ta, tb];
}

export function legLabel(
  t: LegTransport,
  stops: readonly LegStop[],
  homeName?: string | null,
  homeTimezone?: string | null,
): LegLabel {
  const from = stops.find((s) => s.id === t.fromStopId) ?? null;
  const to = stops.find((s) => s.id === t.toStopId) ?? null;
  const meta = TRANSPORT_MODE_META[t.mode];
  const isCar = t.mode === "CAR";
  const word = isCar ? "Drive" : meta.label;
  const home = homeName ?? "home";
  const fromName = t.depIsHome ? home : (from?.name ?? t.depPlace ?? null);
  const toName = t.arrIsHome ? home : (to?.name ?? t.arrPlace ?? null);
  const fromShort = t.depPlace ? placeCode(t.depPlace) : fromName;
  const toShort = t.arrPlace ? placeCode(t.arrPlace) : toName;

  const coded = [t.depPlace, t.arrPlace].some((p) => p && placeCode(p) !== p);
  const ends = (a: string, b: string): [string, string] | string => (coded ? [a, b] : sameRegion(a, b));

  let label = word;
  let sub = "";
  let spoken = "";
  let arrival = "";
  let arrivalSpoken = "";
  let drive: LegLabel["drive"];
  if (t.depAt) {
    if (fromShort && toShort) {
      const e = ends(fromShort, toShort);
      label = typeof e === "string" ? `${word} in ${e}` : `${word} ${e[0]} → ${e[1]}`;
    }
    const { fromTimezone, toTimezone } = endZones(t, (id) => (id ? stops.find((s) => s.id === id)?.timezone : null));
    const { dep, arr, dayDelta } = transportTimeDisplay({
      depAt: t.depAt,
      arrAt: t.arrAt ?? null,
      fromTimezone,
      toTimezone,
      depIsHome: t.depIsHome,
      arrIsHome: t.arrIsHome,
      homeTimezone,
    });
    if (dep) {
      sub = `${formatDayLabel(dep.dateISO)} ${dep.time}`;
      spoken = `${spokenDay(dep.dateISO)} ${dep.time}`;
    }
    if (arr) {
      const mins = durationMinutes(t.depAt, t.arrAt);
      const plus = dayDelta === 0 ? "" : ` ${dayDelta > 0 ? "+" : "−"}${Math.abs(dayDelta)}`;
      arrival = `→ ${arr.time}${plus}${mins ? ` · ${formatDuration(mins)}` : ""}`;
      arrivalSpoken = ` Arrives ${arr.time}${plus}.`;
    }
    if (isCar && t.driveTime) {
      const fit = driveFit(t.driveTime, t.depAt, t.arrAt ?? null);
      drive = { text: planDriveLine(fit), tooShort: fit.tooShort };
      arrivalSpoken += ` ${drive.text}.`;
    }
  } else if (isCar && t.driveEstimate) {
    sub = `${t.driveEstimate.estimated ? "~" : ""}${formatDuration(t.driveEstimate.minutes)} · ${t.driveEstimate.roadKm} km${t.driveEstimate.estimated ? " (estimated)" : ""}`;
    spoken = sub;
  } else {
    const day = from?.departDate ?? to?.arriveDate ?? null;
    if (day) {
      sub = formatDayLabel(day);
      spoken = spokenDay(day);
    }
  }

  let route = "";
  if (fromName && toName) {
    const e = ends(fromName, toName);
    route = typeof e === "string" ? ` in ${e}` : ` from ${e[0]} to ${e[1]}`;
  }
  const detail = [transportDetailsLine(t.mode, t), t.reference?.trim()].filter(Boolean).join(" · ");
  return {
    icon: meta.icon,
    label,
    sub,
    missing: false,
    accessibleName: `${word}${route}${spoken ? `, ${spoken}` : ""}.${arrivalSpoken}${detail ? ` ${detail}.` : ""} Edit.`,
    arrival,
    detail,
    ...(drive ? { drive } : {}),
  };
}

export function missingLegLabel(from: { name: string }, to: { name: string }): LegLabel {
  return {
    icon: null,
    label: `How are you getting to ${to.name}?`,
    sub: "Add",
    missing: true,
    accessibleName: `Add transport from ${from.name} to ${to.name}`,
    arrival: "",
    detail: "",
  };
}

/** PLAN.md §2: no nagging about legs until both stops have dates. */
export function legSlotKind(
  from: { arriveDate: string | null },
  to: { arriveDate: string | null },
  legCount: number,
): "legs" | "missing" | "line" {
  if (legCount > 0) return "legs";
  return from.arriveDate && to.arriveDate ? "missing" : "line";
}
