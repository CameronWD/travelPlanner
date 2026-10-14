/**
 * Booking import matching (spec 2026-10-14 "Matching"): where each place a
 * booking names belongs on the Trip. Deterministic and pure: Claude only
 * reports; this decides.
 */
import { isDateWithin } from "@/lib/dates";

export interface MatchStop {
  id: string;
  name: string;
  country: string | null;
  countryCode: string | null;
  timezone: string | null;
  arriveDate: string | null;
  departDate: string | null;
  sortOrder: number;
}

export interface MatchHome {
  name: string | null;
  countryCode: string | null;
  timezone: string | null;
}

export interface PlaceQuery {
  city: string | null;
  country: string | null;
  place: string | null;
}

export interface DateRange {
  from: string | null;
  to: string | null;
}

export interface ResolveOptions {
  allowHome: boolean;
  allowNew: boolean;
  anyStopOnDate: boolean;
}

export type PlaceMatch =
  | { kind: "home" }
  | { kind: "stop"; stop: MatchStop }
  | { kind: "new"; key: string; name: string; country: string | null; countryCode: string | null }
  | { kind: "none" };

/** Lowercase, accent-stripped, punctuation-collapsed: the common key city/country text compares on. */
function normalise(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** True when `text` (a booking's city, airport or station) names the Stop. A Stop name compares on its first comma part. */
export function sameCity(text: string | null | undefined, stopName: string | null | undefined): boolean {
  const a = normalise(text);
  const b = normalise((stopName ?? "").split(",")[0]);
  if (!a || !b) return false;
  if (a === b) return true;
  const within = (hay: string, needle: string) => needle.length >= 4 && ` ${hay} `.includes(` ${needle} `);
  return within(a, b) || within(b, a);
}

const ALIASES: Record<string, string> = {
  uk: "gb",
  england: "gb",
  scotland: "gb",
  wales: "gb",
  "great britain": "gb",
  usa: "us",
  "united states of america": "us",
  holland: "nl",
  "the netherlands": "nl",
};

let byName: Map<string, string> | null = null;
function countryNames(): Map<string, string> {
  if (byName) return byName;
  const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  const map = new Map<string, string>();
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      let name: string | undefined;
      try {
        name = names.of(code);
      } catch {
        name = undefined;
      }
      // Keep the FIRST code seen for a name: Intl also names "UK" "United
      // Kingdom", and it must not overwrite "GB" (P1 ruling).
      const key = name && name !== "Unknown Region" ? normalise(name) : null;
      if (key && !map.has(key)) map.set(key, code.toLowerCase());
    }
  }
  byName = map;
  return map;
}

/** Lowercase ISO 3166-1 alpha-2 for a country name or code, or null. */
export function countryCodeOf(value: string | null | undefined): string | null {
  const key = normalise(value);
  if (!key) return null;
  if (ALIASES[key]) return ALIASES[key];
  if (/^[a-z]{2}$/.test(key)) return key;
  return countryNames().get(key) ?? null;
}

function stopCountry(s: MatchStop): string | null {
  return s.countryCode?.toLowerCase() || countryCodeOf(s.country);
}

/** True when the Stop's arrive..depart span intersects `range`. */
function overlaps(stop: { arriveDate: string | null; departDate: string | null }, range: DateRange): boolean {
  if (!stop.arriveDate || !stop.departDate || !range.from) return false;
  const to = range.to ?? range.from;
  return range.from <= stop.departDate && to >= stop.arriveDate;
}

export function outsideStay(stop: MatchStop, date: string | null): boolean {
  return Boolean(date && stop.arriveDate && stop.departDate && !isDateWithin(date, stop.arriveDate, stop.departDate));
}

const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

function distance(s: MatchStop, r: DateRange): number {
  if (!s.arriveDate || !s.departDate || !r.from) return Number.POSITIVE_INFINITY;
  const to = r.to ?? r.from;
  if (to < s.arriveDate) return dayNumber(s.arriveDate) - dayNumber(to);
  if (r.from > s.departDate) return dayNumber(r.from) - dayNumber(s.departDate);
  return 0;
}

function nearest(stops: MatchStop[], r: DateRange): MatchStop {
  return [...stops].sort((a, b) => distance(a, r) - distance(b, r) || a.sortOrder - b.sortOrder)[0];
}

function matchesHome(q: PlaceQuery, home: MatchHome): boolean {
  if (!home.name) return false;
  if (sameCity(q.city, home.name) || sameCity(q.place, home.name)) return true;
  const cc = countryCodeOf(q.country);
  return !q.city && !q.place && cc !== null && cc === home.countryCode?.toLowerCase();
}

export function resolvePlace(
  q: PlaceQuery,
  range: DateRange,
  ctx: { home: MatchHome; stops: MatchStop[] },
  opts: ResolveOptions,
): PlaceMatch {
  if (opts.allowHome && matchesHome(q, ctx.home)) return { kind: "home" };

  const cc = countryCodeOf(q.country);
  const compatible = (s: MatchStop) => !cc || !stopCountry(s) || stopCountry(s) === cc;

  const byCity = ctx.stops.filter((s) => (sameCity(q.city, s.name) || sameCity(q.place, s.name)) && compatible(s));
  if (byCity.length > 0) return { kind: "stop", stop: nearest(byCity, range) };

  if (!q.city && cc) {
    const inCountry = ctx.stops.filter((s) => stopCountry(s) === cc && overlaps(s, range));
    if (inCountry.length > 0) return { kind: "stop", stop: nearest(inCountry, range) };
  }

  if (opts.anyStopOnDate && range.from) {
    const covering = ctx.stops.filter((s) => overlaps(s, range) && compatible(s));
    if (covering.length > 0) return { kind: "stop", stop: nearest(covering, range) };
  }

  if (opts.allowNew && q.city) {
    const name = q.city.trim();
    return { kind: "new", key: `${normalise(name)}|${cc ?? ""}`, name, country: q.country?.trim() || null, countryCode: cc };
  }
  return { kind: "none" };
}
