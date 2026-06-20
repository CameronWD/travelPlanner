/**
 * Common currencies for the Trip Planner.
 *
 * Each entry has:
 *   code   — ISO 4217 currency code
 *   name   — Human-readable full name
 *   symbol — Display symbol
 */
export interface Currency {
  code: string;
  name: string;
  symbol: string;
}

export const CURRENCIES: Currency[] = [
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
];

/** The codes as a readonly tuple so Zod can use them as a literal union. */
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [
  string,
  ...string[],
];

/** Default home currency for new trips. */
export const DEFAULT_HOME_CURRENCY = "AUD";

/**
 * Returns the full name for a currency code, or the code itself as a fallback.
 *
 * @example currencyName("EUR") // "Euro"
 */
export function currencyName(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.name ?? code;
}
