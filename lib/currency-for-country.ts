/**
 * ISO 3166-1 alpha-2 → a home currency Teepee offers (lib/currencies.ts).
 * Only countries whose everyday currency is one of those; anything else is
 * undefined and the caller keeps what it had (NEW_TRIP.md §4).
 */
const EUR = ["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES", "AD", "MC", "SM", "VA", "ME", "XK", "GF", "GP", "MQ", "RE", "YT", "PM", "BL", "MF", "AX"];
const USD = ["US", "PR", "GU", "VI", "AS", "MP", "UM", "EC", "SV", "TL", "FM", "MH", "PW", "BQ", "TC", "VG", "IO"];

export const BY_COUNTRY: Record<string, string> = {
  ...Object.fromEntries(EUR.map((c) => [c, "EUR"])),
  ...Object.fromEntries(USD.map((c) => [c, "USD"])),
  AU: "AUD", CX: "AUD", CC: "AUD", NF: "AUD", NR: "AUD", KI: "AUD", TV: "AUD", HM: "AUD",
  NZ: "NZD", CK: "NZD", NU: "NZD", PN: "NZD", TK: "NZD",
  GB: "GBP", IM: "GBP", JE: "GBP", GG: "GBP",
  JP: "JPY",
  CH: "CHF", LI: "CHF",
  CA: "CAD",
  SG: "SGD",
  TH: "THB",
};

export function currencyForCountry(iso2: string): string | undefined {
  return BY_COUNTRY[iso2.trim().toUpperCase()];
}
