import type { FeedHoliday } from "./ics";

export type DayPlace = { countryCode: string; region: string | null };

export type PlacesOnDayInput = {
  date: string;
  tripStart: string | null;
  tripEnd: string | null;
  home: DayPlace | null;
  stops: Array<{ arriveDate: string | null; departDate: string | null; countryCode: string | null; region: string | null }>;
  transportEnds: Array<{ date: string; place: DayPlace | null; isHome: boolean }>;
};

export type DayHoliday = {
  countryCode: string;
  name: string;
  kind: "public" | "observance";
  halfDay: boolean;
  namedRegions: string[] | null;
};

const SHOWN_OBSERVANCES = ["Christmas Eve", "New Year's Eve", "Good Friday"];

function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

function stopCovers(s: PlacesOnDayInput["stops"][number], date: string): boolean {
  if (!s.arriveDate && !s.departDate) return false;
  const from = s.arriveDate ?? s.departDate!;
  const to = s.departDate ?? s.arriveDate!;
  return from <= date && date <= to;
}

export function placesOnDay(input: PlacesOnDayInput): DayPlace[] {
  const { date, home } = input;
  const places: DayPlace[] = [];

  const covering = input.stops.filter((s) => stopCovers(s, date));
  if (covering.length > 0) {
    for (const s of covering) if (s.countryCode) places.push({ countryCode: s.countryCode, region: s.region });
  } else {
    for (const e of input.transportEnds) {
      if (e.date !== date) continue;
      const place = e.isHome ? home : e.place;
      if (place) places.push(place);
    }
  }

  if (home && (date === input.tripStart || date === input.tripEnd)) places.push(home);

  const seen = new Set<string>();
  return places.filter((p) => {
    const key = `${p.countryCode.toLowerCase()}|${p.region ? norm(p.region) : ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function holidaysOnDay(places: DayPlace[], date: string, feeds: Map<string, FeedHoliday[]>): DayHoliday[] {
  const found = new Map<string, DayHoliday>();

  for (const place of places) {
    const cc = place.countryCode.toLowerCase();
    const feed = feeds.get(cc);
    if (!feed) continue;

    const vocabulary = new Set(feed.flatMap((h) => h.regions ?? []).map(norm));
    const region = place.region ? norm(place.region) : null;

    for (const h of feed) {
      if (h.date !== date) continue;
      if (h.kind === "observance" && !SHOWN_OBSERVANCES.some((p) => h.name.startsWith(p))) continue;

      let namedRegions: string[] | null = null;
      if (h.regions) {
        if (region && h.regions.some((r) => norm(r) === region)) {
          namedRegions = null;
        } else if (region && vocabulary.has(region)) {
          continue;
        } else {
          namedRegions = h.regions;
        }
      }

      const key = `${cc}|${h.name}`;
      const existing = found.get(key);
      if (existing && (existing.namedRegions === null || namedRegions !== null)) continue;
      found.set(key, { countryCode: cc, name: h.name, kind: h.kind, halfDay: h.halfDay, namedRegions });
    }
  }

  return [...found.values()];
}

export function holidayLine(h: DayHoliday): string {
  const country = new Intl.DisplayNames(["en"], { type: "region" }).of(h.countryCode.toUpperCase()) ?? h.countryCode.toUpperCase();
  if (h.namedRegions) return `${h.name}: public holiday in parts of ${country} (${h.namedRegions.join(", ")})`;
  if (h.kind === "observance") return `${h.name} (${country}): many places close early`;
  if (h.halfDay) return `${h.name} (${country}): half-day public holiday, many places close early`;
  return `${h.name} (${country}): public holiday, expect closures`;
}
