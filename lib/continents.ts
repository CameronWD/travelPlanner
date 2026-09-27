/**
 * ISO 3166-1 alpha-2 (lowercase) → continent lookup.
 *
 * No framework, no network. Fully unit-testable.
 *
 * Table covers every officially-assigned ISO 3166-1 alpha-2 code (countries
 * and dependent territories), plus a small number of practically-necessary
 * extras that real-world geocoders (e.g. Nominatim) return even though they
 * are not part of the "officially assigned" ISO list:
 *   - "xk" (Kosovo) — user-assigned, but ubiquitous in geocoding data.
 *
 * Transcontinental countries are placed per common travel/geocoding
 * convention (matching restcountries.com-style groupings): Russia → Europe;
 * Turkey, Georgia, Armenia and Azerbaijan → Asia; Cyprus → Europe; Egypt →
 * Africa. See the per-continent lists below for the exact call made for
 * each code.
 */

export type Continent =
  | "Europe"
  | "Asia"
  | "Africa"
  | "North America"
  | "South America"
  | "Oceania"
  | "Antarctica";

const AFRICA = [
  "dz", "ao", "bj", "bw", "bf", "bi", "cv", "cm", "cf", "td", "km", "cd", "cg",
  "ci", "dj", "eg", "gq", "er", "sz", "et", "ga", "gm", "gh", "gn", "gw", "ke",
  "ls", "lr", "ly", "mg", "mw", "ml", "mr", "mu", "ma", "mz", "na", "ne", "ng",
  "rw", "st", "sn", "sc", "sl", "so", "za", "ss", "sd", "tz", "tg", "tn", "ug",
  "zm", "zw", "eh",
  // Territories / dependencies
  "re", "yt", "sh", "io",
];

const ASIA = [
  "af", "am", "az", "bh", "bd", "bt", "bn", "kh", "cn", "ge", "hk", "in", "id",
  "ir", "iq", "il", "jp", "jo", "kz", "kp", "kr", "kw", "kg", "la", "lb", "mo",
  "my", "mv", "mn", "mm", "np", "om", "pk", "ps", "ph", "qa", "sa", "sg", "lk",
  "sy", "tw", "tj", "th", "tl", "tr", "tm", "ae", "uz", "vn", "ye",
];

const EUROPE = [
  "al", "ad", "at", "by", "be", "ba", "bg", "hr", "cy", "cz", "dk", "ee", "fo",
  "fi", "fr", "de", "gi", "gr", "gg", "va", "hu", "is", "ie", "im", "it", "je",
  "xk", "lv", "li", "lt", "lu", "mt", "md", "mc", "me", "nl", "mk", "no", "pl",
  "pt", "ro", "ru", "sm", "rs", "sk", "si", "es", "sj", "se", "ch", "ua", "gb",
  "ax",
];

const NORTH_AMERICA = [
  "ag", "bs", "bb", "bz", "ca", "cr", "cu", "dm", "do", "sv", "gd", "gt", "ht",
  "hn", "jm", "mx", "ni", "pa", "kn", "lc", "vc", "tt", "us",
  // Territories / dependencies
  "ai", "aw", "bm", "bq", "vg", "ky", "cw", "gl", "gp", "mq", "ms", "pr", "bl",
  "mf", "pm", "sx", "tc", "vi",
];

const SOUTH_AMERICA = [
  "ar", "bo", "br", "cl", "co", "ec", "gy", "py", "pe", "sr", "uy", "ve",
  "fk", "gf",
];

const OCEANIA = [
  "au", "fj", "ki", "mh", "fm", "nr", "nz", "pw", "pg", "ws", "sb", "to", "tv",
  "vu",
  // Territories / dependencies
  "as", "ck", "pf", "gu", "nc", "nu", "nf", "mp", "pn", "tk", "wf", "cx", "cc",
  "um",
];

const ANTARCTICA = ["aq", "bv", "tf", "hm", "gs"];

const TABLE: Record<string, Continent> = {};
function fill(codes: string[], continent: Continent) {
  for (const code of codes) TABLE[code] = continent;
}
fill(AFRICA, "Africa");
fill(ASIA, "Asia");
fill(EUROPE, "Europe");
fill(NORTH_AMERICA, "North America");
fill(SOUTH_AMERICA, "South America");
fill(OCEANIA, "Oceania");
fill(ANTARCTICA, "Antarctica");

/** Every lowercase ISO 3166-1 alpha-2 code this table knows, for tests. */
export const KNOWN_CONTINENT_CODES: readonly string[] = Object.keys(TABLE);

/** Continent for an ISO 3166-1 alpha-2 country code (case-insensitive). Null for nullish/unknown input. */
export function continentOf(countryCode: string | null | undefined): string | null {
  if (!countryCode) return null;
  return TABLE[countryCode.toLowerCase()] ?? null;
}
