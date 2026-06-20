/**
 * Pure money helpers for the money input. Kept framework-free so they are
 * trivially testable. For now we assume 2 decimal places; zero-decimal
 * currencies (JPY, etc.) are handled generically in a later phase via
 * `decimalsFor`, which currently always returns 2.
 */

export interface MoneyValue {
  /** Amount in the currency's minor unit (e.g. cents). Integer. */
  amountMinor: number;
  /** ISO 4217 currency code, uppercased. */
  currency: string;
}

/**
 * Decimal places for a currency. Generic seam for zero-decimal currencies
 * (JPY, KRW, …); for now every currency uses 2 places. The lookup table is
 * intentionally empty until that work lands.
 */
const CURRENCY_DECIMALS: Record<string, number> = {};

export function decimalsFor(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
}

/**
 * Parse a free-text amount into minor units for the given currency.
 *
 *   parseAmountToMinor("12.50", "EUR")  -> 1250
 *   parseAmountToMinor("1234", "EUR")   -> 123400
 *   parseAmountToMinor("", "EUR")       -> null   (no amount)
 *   parseAmountToMinor("abc", "EUR")    -> null   (invalid)
 *
 * Accepts an optional leading sign, thousands separators (commas/spaces),
 * and a single `.` decimal point. Rounds to the currency's decimal places.
 * Returns null for empty / unparseable input so callers can ignore it.
 */
export function parseAmountToMinor(
  raw: string,
  currency: string,
): number | null {
  if (typeof raw !== "string") return null;

  // Strip thousands separators (commas and spaces) but keep sign + dot.
  const cleaned = raw.trim().replace(/[,\s]/g, "");
  if (cleaned === "") return null;

  // Allow an optional sign, digits, and at most one decimal point.
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;
  // Reject inputs with no digits at all (e.g. ".", "-", "-.").
  if (!/\d/.test(cleaned)) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;

  const factor = 10 ** decimalsFor(currency);
  return Math.round(value * factor);
}

/**
 * Build a MoneyValue from raw amount text + currency, or null if the amount
 * can't be parsed.
 */
export function toMoneyValue(
  raw: string,
  currency: string,
): MoneyValue | null {
  const amountMinor = parseAmountToMinor(raw, currency);
  if (amountMinor === null) return null;
  return { amountMinor, currency: currency.toUpperCase() };
}

/** Format minor units back to a plain decimal string (e.g. 1250 -> "12.50"). */
export function formatMinor(amountMinor: number, currency: string): string {
  const decimals = decimalsFor(currency);
  return (amountMinor / 10 ** decimals).toFixed(decimals);
}
