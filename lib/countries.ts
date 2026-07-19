// Node/Next provide Intl.DisplayNames; construct once.
// fallback: "none" returns undefined for unknown codes rather than the raw code,
// letting us distinguish "not a real region" from "ZZ"-style unknowns.
const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

/** Display name for an ISO 3166-1 alpha-2 country code (case-insensitive). */
export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  const upper = code.toUpperCase();
  try {
    const name = REGION_NAMES.of(upper);
    // "Unknown Region" is the ICU sentinel for codes that are syntactically valid
    // but not assigned (e.g. "ZZ"). Treat it the same as undefined → fall back.
    if (!name || name === "Unknown Region") return upper;
    return name;
  } catch {
    return upper;
  }
}
