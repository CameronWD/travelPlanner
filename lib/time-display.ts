/**
 * Pure display helpers for timezone-aware time rendering (Feature: tz display).
 * Local time stays primary; these add a legible zone label and cross-zone
 * "+N day" math. No React, no network.
 */
import { instantToZonedTime, instantToZonedDateISO } from "@/lib/tz";
import { tzAbbrev, daysBetween } from "@/lib/dates";

/** Short zone label for an instant's local date, e.g. "CEST"; "UTC" when unknown. */
export function zoneLabel(timezone: string | null | undefined, onDateISO: string): string {
  return tzAbbrev(timezone ?? null, onDateISO) ?? "UTC";
}

/** Compact "5 Aug" from a YYYY-MM-DD calendar date (zone-free). */
export function shortDate(dateISO: string): string {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${dateISO}T00:00:00Z`));
}

interface ZonedEndpoint { time: string; zone: string; dateISO: string }
export interface TransportTimeDisplay {
  dep: ZonedEndpoint | null;
  arr: ZonedEndpoint | null;
  /** arr calendar date minus dep calendar date, each in its own zone; 0 same day, can be negative. */
  dayDelta: number;
}

export interface HomeZone { depIsHome?: boolean | null; arrIsHome?: boolean | null; homeTimezone?: string | null }

/** Each end's own zone, null when it has none: a Home end's is the Trip's Home zone, a Stop end's is its Stop's. */
function ownZones(
  fromTz: string | null | undefined,
  toTz: string | null | undefined,
  home?: HomeZone,
): { dep: string | null; arr: string | null } {
  const homeTz = home?.homeTimezone || null;
  return {
    dep: (home?.depIsHome && homeTz) || fromTz || null,
    arr: (home?.arrIsHome && homeTz) || toTz || null,
  };
}

/** Timezone for each transport endpoint: its own zone (Home end → the Trip's Home zone;
 * Stop end → its Stop's), else the other endpoint's, else UTC. Shared by display AND the
 * write path so a typed wall time round-trips exactly (things-to-fix P0-1; ADR 0030 amendment). */
export function resolveEndpointZones(
  fromTz: string | null | undefined,
  toTz: string | null | undefined,
  home?: HomeZone,
): { depTz: string; arrTz: string } {
  const own = ownZones(fromTz, toTz, home);
  return { depTz: own.dep ?? own.arr ?? "UTC", arrTz: own.arr ?? own.dep ?? "UTC" };
}

export function transportTimeDisplay(input: {
  depAt: Date | null | undefined;
  arrAt: Date | null | undefined;
  fromTimezone: string | null | undefined;
  toTimezone: string | null | undefined;
} & HomeZone): TransportTimeDisplay {
  const { depAt, arrAt, fromTimezone, toTimezone, depIsHome, arrIsHome, homeTimezone } = input;
  const home = { depIsHome, arrIsHome, homeTimezone };
  const own = ownZones(fromTimezone, toTimezone, home);
  const { depTz, arrTz } = resolveEndpointZones(fromTimezone, toTimezone, home);

  let dep: ZonedEndpoint | null = null;
  if (depAt) {
    const dateISO = instantToZonedDateISO(depAt, depTz);
    dep = { time: instantToZonedTime(depAt, depTz), zone: zoneLabel(own.dep ?? own.arr, dateISO), dateISO };
  }
  let arr: ZonedEndpoint | null = null;
  if (arrAt) {
    const dateISO = instantToZonedDateISO(arrAt, arrTz);
    arr = { time: instantToZonedTime(arrAt, arrTz), zone: zoneLabel(own.arr ?? own.dep, dateISO), dateISO };
  }
  const dayDelta = dep && arr ? daysBetween(dep.dateISO, arr.dateISO) : 0;
  return { dep, arr, dayDelta };
}

/** Format an instant as a datetime-local input value (YYYY-MM-DDTHH:mm) in the
 * given zone — the inverse of the wall-time write path (things-to-fix P0-1). */
export function instantToWallTimeInput(
  instant: Date | null | undefined,
  timeZone: string,
): string {
  if (!instant) return "";
  return `${instantToZonedDateISO(instant, timeZone)}T${instantToZonedTime(instant, timeZone)}`;
}

/** Render the "+1 day" / "−1 day" suffix for a cross-zone arrival; "" when same day. */
export function dayDeltaSuffix(dayDelta: number): string {
  if (dayDelta === 0) return "";
  const sign = dayDelta > 0 ? "+" : "−";
  const n = Math.abs(dayDelta);
  return ` (${sign}${n} day${n === 1 ? "" : "s"})`;
}
