/**
 * Timezone utilities for the Trip Planner.
 *
 * Provides a curated list of IANA timezones for UI selectors and a best-effort
 * guesser that maps common country names/codes to their primary timezone.
 */

export interface TimezoneOption {
  value: string; // IANA timezone identifier
  label: string; // Human-readable label
}

/**
 * Curated list of common IANA timezones for the timezone selector.
 * Grouped conceptually but exported as a flat array.
 */
export const TIMEZONES: TimezoneOption[] = [
  // UTC
  { value: "UTC", label: "UTC — Coordinated Universal Time" },

  // Europe
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Dublin", label: "Dublin (GMT/IST)" },
  { value: "Europe/Lisbon", label: "Lisbon (WET/WEST)" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { value: "Europe/Madrid", label: "Madrid (CET/CEST)" },
  { value: "Europe/Rome", label: "Rome (CET/CEST)" },
  { value: "Europe/Amsterdam", label: "Amsterdam (CET/CEST)" },
  { value: "Europe/Brussels", label: "Brussels (CET/CEST)" },
  { value: "Europe/Vienna", label: "Vienna (CET/CEST)" },
  { value: "Europe/Zurich", label: "Zurich (CET/CEST)" },
  { value: "Europe/Stockholm", label: "Stockholm (CET/CEST)" },
  { value: "Europe/Oslo", label: "Oslo (CET/CEST)" },
  { value: "Europe/Copenhagen", label: "Copenhagen (CET/CEST)" },
  { value: "Europe/Helsinki", label: "Helsinki (EET/EEST)" },
  { value: "Europe/Warsaw", label: "Warsaw (CET/CEST)" },
  { value: "Europe/Prague", label: "Prague (CET/CEST)" },
  { value: "Europe/Budapest", label: "Budapest (CET/CEST)" },
  { value: "Europe/Athens", label: "Athens (EET/EEST)" },
  { value: "Europe/Bucharest", label: "Bucharest (EET/EEST)" },
  { value: "Europe/Istanbul", label: "Istanbul (TRT)" },
  { value: "Europe/Moscow", label: "Moscow (MSK)" },

  // Americas
  { value: "America/New_York", label: "New York (ET)" },
  { value: "America/Chicago", label: "Chicago (CT)" },
  { value: "America/Denver", label: "Denver (MT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)" },
  { value: "America/Anchorage", label: "Anchorage (AKT)" },
  { value: "America/Toronto", label: "Toronto (ET)" },
  { value: "America/Vancouver", label: "Vancouver (PT)" },
  { value: "America/Sao_Paulo", label: "São Paulo (BRT)" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (ART)" },
  { value: "America/Bogota", label: "Bogotá (COT)" },
  { value: "America/Lima", label: "Lima (PET)" },
  { value: "America/Santiago", label: "Santiago (CLT)" },
  { value: "America/Mexico_City", label: "Mexico City (CST/CDT)" },

  // Africa / Middle East
  { value: "Africa/Cairo", label: "Cairo (EET)" },
  { value: "Africa/Johannesburg", label: "Johannesburg (SAST)" },
  { value: "Africa/Lagos", label: "Lagos (WAT)" },
  { value: "Africa/Nairobi", label: "Nairobi (EAT)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Riyadh", label: "Riyadh (AST)" },
  { value: "Asia/Jerusalem", label: "Jerusalem (IST/IDT)" },

  // Asia
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Dhaka", label: "Dhaka (BST)" },
  { value: "Asia/Kathmandu", label: "Kathmandu (NPT)" },
  { value: "Asia/Bangkok", label: "Bangkok (ICT)" },
  { value: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh City (ICT)" },
  { value: "Asia/Jakarta", label: "Jakarta (WIB)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (MYT)" },
  { value: "Asia/Manila", label: "Manila (PHT)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (HKT)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Asia/Seoul", label: "Seoul (KST)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },

  // Pacific / Oceania
  { value: "Australia/Perth", label: "Perth (AWST)" },
  { value: "Australia/Darwin", label: "Darwin (ACST)" },
  { value: "Australia/Adelaide", label: "Adelaide (ACST/ACDT)" },
  { value: "Australia/Brisbane", label: "Brisbane (AEST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
  { value: "Australia/Melbourne", label: "Melbourne (AEST/AEDT)" },
  { value: "Pacific/Auckland", label: "Auckland (NZST/NZDT)" },
  { value: "Pacific/Fiji", label: "Fiji (FJT)" },
  { value: "Pacific/Honolulu", label: "Honolulu (HST)" },
];

// ---------------------------------------------------------------------------
// Country → timezone guesser
// ---------------------------------------------------------------------------

/**
 * Mapping of normalised country name/code strings to their primary IANA TZ.
 * Keys are lowercased and stripped of extra whitespace for matching.
 */
const COUNTRY_TO_TZ: Record<string, string> = {
  // UK / British Isles
  uk: "Europe/London",
  "united kingdom": "Europe/London",
  "great britain": "Europe/London",
  gb: "Europe/London",
  england: "Europe/London",
  scotland: "Europe/London",
  wales: "Europe/London",
  ireland: "Europe/Dublin",
  ie: "Europe/Dublin",

  // Western Europe
  france: "Europe/Paris",
  fr: "Europe/Paris",
  germany: "Europe/Berlin",
  de: "Europe/Berlin",
  italy: "Europe/Rome",
  it: "Europe/Rome",
  spain: "Europe/Madrid",
  es: "Europe/Madrid",
  portugal: "Europe/Lisbon",
  pt: "Europe/Lisbon",
  netherlands: "Europe/Amsterdam",
  nl: "Europe/Amsterdam",
  belgium: "Europe/Brussels",
  be: "Europe/Brussels",
  austria: "Europe/Vienna",
  at: "Europe/Vienna",
  switzerland: "Europe/Zurich",
  ch: "Europe/Zurich",
  sweden: "Europe/Stockholm",
  se: "Europe/Stockholm",
  norway: "Europe/Oslo",
  no: "Europe/Oslo",
  denmark: "Europe/Copenhagen",
  dk: "Europe/Copenhagen",
  finland: "Europe/Helsinki",
  fi: "Europe/Helsinki",
  poland: "Europe/Warsaw",
  pl: "Europe/Warsaw",
  "czech republic": "Europe/Prague",
  czechia: "Europe/Prague",
  cz: "Europe/Prague",
  hungary: "Europe/Budapest",
  hu: "Europe/Budapest",
  greece: "Europe/Athens",
  gr: "Europe/Athens",
  romania: "Europe/Bucharest",
  ro: "Europe/Bucharest",
  turkey: "Europe/Istanbul",
  tr: "Europe/Istanbul",
  russia: "Europe/Moscow",
  ru: "Europe/Moscow",

  // Americas
  usa: "America/New_York",
  "united states": "America/New_York",
  us: "America/New_York",
  canada: "America/Toronto",
  ca: "America/Toronto",
  brazil: "America/Sao_Paulo",
  br: "America/Sao_Paulo",
  argentina: "America/Argentina/Buenos_Aires",
  ar: "America/Argentina/Buenos_Aires",
  colombia: "America/Bogota",
  co: "America/Bogota",
  peru: "America/Lima",
  pe: "America/Lima",
  chile: "America/Santiago",
  cl: "America/Santiago",
  mexico: "America/Mexico_City",
  mx: "America/Mexico_City",

  // Africa / Middle East
  egypt: "Africa/Cairo",
  eg: "Africa/Cairo",
  "south africa": "Africa/Johannesburg",
  za: "Africa/Johannesburg",
  nigeria: "Africa/Lagos",
  ng: "Africa/Lagos",
  kenya: "Africa/Nairobi",
  ke: "Africa/Nairobi",
  uae: "Asia/Dubai",
  "united arab emirates": "Asia/Dubai",
  ae: "Asia/Dubai",
  "saudi arabia": "Asia/Riyadh",
  sa: "Asia/Riyadh",
  israel: "Asia/Jerusalem",
  il: "Asia/Jerusalem",

  // Asia
  india: "Asia/Kolkata",
  in: "Asia/Kolkata",
  bangladesh: "Asia/Dhaka",
  bd: "Asia/Dhaka",
  nepal: "Asia/Kathmandu",
  np: "Asia/Kathmandu",
  thailand: "Asia/Bangkok",
  th: "Asia/Bangkok",
  vietnam: "Asia/Ho_Chi_Minh",
  vn: "Asia/Ho_Chi_Minh",
  indonesia: "Asia/Jakarta",
  id: "Asia/Jakarta",
  singapore: "Asia/Singapore",
  sg: "Asia/Singapore",
  malaysia: "Asia/Kuala_Lumpur",
  my: "Asia/Kuala_Lumpur",
  philippines: "Asia/Manila",
  ph: "Asia/Manila",
  "hong kong": "Asia/Hong_Kong",
  hk: "Asia/Hong_Kong",
  china: "Asia/Shanghai",
  cn: "Asia/Shanghai",
  "south korea": "Asia/Seoul",
  korea: "Asia/Seoul",
  kr: "Asia/Seoul",
  japan: "Asia/Tokyo",
  jp: "Asia/Tokyo",

  // Pacific / Oceania
  australia: "Australia/Sydney",
  au: "Australia/Sydney",
  "new zealand": "Pacific/Auckland",
  nz: "Pacific/Auckland",
  fiji: "Pacific/Fiji",
  fj: "Pacific/Fiji",
};

/**
 * Best-effort timezone guesser from a country name or code.
 *
 * Normalises the input (trim, lowercase) and looks it up in the table.
 * Falls back to 'UTC' for unknown countries or when called without an argument.
 */
export function guessTimezoneForCountry(country?: string | null): string {
  if (!country) return "UTC";
  const key = country.trim().toLowerCase();
  return COUNTRY_TO_TZ[key] ?? "UTC";
}
