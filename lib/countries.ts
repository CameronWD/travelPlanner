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

/**
 * Regional-indicator flag emoji for an ISO 3166-1 alpha-2 code (e.g. "fr" ->
 * "🇫🇷"), case-insensitive. Empty string for nullish or non-alphabetic input —
 * callers pair this with `countryName(code)` as the accessible label, since
 * the emoji glyph alone isn't announced usefully by screen readers.
 */
export function countryFlagEmoji(code: string | null | undefined): string {
  if (!code) return "";
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const points = [...upper].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...points);
}
