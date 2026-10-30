export interface PickedPlace {
  name: string;
  /** "New South Wales, Australia" — tells two Sydneys apart. */
  region?: string;
  lat: number;
  lng: number;
  /** ISO 3166-1 alpha-2, lower-case (as Stop.countryCode stores it). */
  countryCode?: string;
  /** Locality, else postal town, else the county or state — what a Marker or Stop calls its city. */
  city?: string;
  /** Country in full ("Japan"). */
  country?: string;
  placeId: string;
  address?: string;
  /** Google's place types, from the prediction (free). */
  types?: string[];
}

export function isEstablishment(p: PickedPlace): boolean {
  return Boolean(p.types?.some((t) => t === "establishment" || t === "point_of_interest"));
}
