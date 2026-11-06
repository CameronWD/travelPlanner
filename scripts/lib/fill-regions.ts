export interface RegionTarget {
  kind: "stop" | "home" | "transport-dep" | "transport-arr";
  id: string;
  placeId: string;
  label: string;
  needsCountry: boolean;
}

interface StopRow {
  id: string;
  name: string;
  placeId: string | null;
  region: string | null;
}

interface HomeRow {
  id: string;
  homeName: string | null;
  homePlaceId: string | null;
  homeRegion: string | null;
}

interface TransportRow {
  id: string;
  depPlace: string | null;
  depPlaceId: string | null;
  depRegion: string | null;
  depCountryCode: string | null;
  depIsHome: boolean;
  arrPlace: string | null;
  arrPlaceId: string | null;
  arrRegion: string | null;
  arrCountryCode: string | null;
  arrIsHome: boolean;
}

export function selectTargets(rows: { stops: StopRow[]; trips: HomeRow[]; transports: TransportRow[] }): RegionTarget[] {
  const out: RegionTarget[] = [];
  for (const s of rows.stops) {
    if (s.placeId && s.region === null) out.push({ kind: "stop", id: s.id, placeId: s.placeId, label: s.name, needsCountry: false });
  }
  for (const t of rows.trips) {
    if (t.homePlaceId && t.homeRegion === null) out.push({ kind: "home", id: t.id, placeId: t.homePlaceId, label: t.homeName ?? "", needsCountry: false });
  }
  for (const x of rows.transports) {
    if (!x.depIsHome && x.depPlaceId && x.depRegion === null) {
      out.push({ kind: "transport-dep", id: x.id, placeId: x.depPlaceId, label: x.depPlace ?? "", needsCountry: x.depCountryCode === null });
    }
    if (!x.arrIsHome && x.arrPlaceId && x.arrRegion === null) {
      out.push({ kind: "transport-arr", id: x.id, placeId: x.arrPlaceId, label: x.arrPlace ?? "", needsCountry: x.arrCountryCode === null });
    }
  }
  return out;
}

export function distinctCountries(codes: (string | null | undefined)[]): string[] {
  return [...new Set(codes.map((c) => c?.trim().toLowerCase()).filter((c): c is string => !!c))];
}
