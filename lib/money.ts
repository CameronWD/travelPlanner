/**
 * Pure money helpers. Kept framework-free so they are trivially testable.
 *
 * Amounts are stored as integer minor units + an ISO 4217 currency code.
 * Minor unit count depends on the currency's decimal places:
 *   - 0 decimals: JPY, KRW, VND, CLP, ISK
 *   - 2 decimals: most currencies (AUD, USD, EUR, GBP, …)
 *   - 3 decimals: BHD, KWD, OMR, TND
 */

export interface MoneyValue {
  /** Amount in the currency's minor unit (e.g. cents). Integer. */
  amountMinor: number;
  /** ISO 4217 currency code, uppercased. */
  currency: string;
}

/**
 * Decimal places by ISO 4217 code.
 * Only non-2 entries need to be listed; 2 is the default.
 */
const CURRENCY_DECIMALS: Record<string, number> = {
  // Zero-decimal currencies
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  // Three-decimal currencies
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};

/**
 * Return the number of minor-unit decimal places for a currency.
 * Defaults to 2 for unknown currencies.
 */
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
  // Multiply in float, then strip binary-representation noise before rounding:
  // e.g. 1.005 * 100 === 100.49999999999999, which a naive Math.round would
  // truncate to 100 instead of the intended 101. Normalising to a few decimal
  // places via toFixed removes the ~1e-13 error without affecting genuine
  // fractional minor units, then we round half-up to the nearest minor unit.
  return Math.round(Number((value * factor).toFixed(4)));
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

/**
 * Format minor units as a localised currency string using Intl.NumberFormat.
 *
 *   formatMoney(1000, "JPY")          → "¥1,000"
 *   formatMoney(1250, "AUD")          → "A$12.50"
 *   formatMoney(-1250, "EUR", "de-DE") → "-12,50 €"
 *
 * Falls back to a plain `"1234.56 XYZ"` string when the currency code is
 * unknown to the runtime (avoids throwing on bad input).
 */
export function formatMoney(
  amountMinor: number,
  currency: string,
  locale: string = "en-AU",
): string {
  const decimals = decimalsFor(currency);
  const value = amountMinor / 10 ** decimals;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    // Invalid currency code — return a readable fallback.
    return `${value.toFixed(decimals)} ${currency.toUpperCase()}`;
  }
}

/**
 * Format minor units as a plain number string without the currency symbol.
 * Useful for inputs or tables where the symbol is shown separately.
 *
 *   formatAmountOnly(1000, "JPY")  → "1,000"
 *   formatAmountOnly(1250, "AUD")  → "12.50"
 */
export function formatAmountOnly(
  amountMinor: number,
  currency: string,
  locale: string = "en-AU",
): string {
  const decimals = decimalsFor(currency);
  const value = amountMinor / 10 ** decimals;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Round-half-up (always rounds 0.5 toward positive infinity).
 * JavaScript's Math.round does this for positive numbers, but for negative
 * numbers -0.5 rounds to 0 (half-up toward +∞). This function is consistent.
 */
function roundHalfUp(n: number): number {
  return Math.floor(n + 0.5);
}

/**
 * Convert an amount in minor units from one currency to another using a
 * provided rate where `rate` = (1 unit of fromCurrency) / (1 unit of toCurrency).
 *
 *   convertMinor(1250, "EUR", "AUD", 1.65)  → 2063   (€12.50 * 1.65 = A$20.625 → 2063 minor)
 *   convertMinor(1000, "JPY", "AUD", 0.011) → 1100   (¥1000 * 0.011 = A$11.00 → 1100 minor)
 *   convertMinor(2000, "AUD", "JPY", 96.5)  → 1930   (A$20 * 96.5 = ¥1930 → 1930 minor)
 *   convertMinor(1250, "EUR", "EUR", 1)     → 1250   (same currency → passthrough)
 *
 * Uses round-half-up for the final minor-unit rounding step.
 */
export function convertMinor(
  amountMinor: number,
  fromCurrency: string,
  toCurrency: string,
  rate: number,
): number {
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
    return amountMinor;
  }

  const fromDecimals = decimalsFor(fromCurrency);
  const toDecimals = decimalsFor(toCurrency);

  // Convert minor → major, apply rate, convert back to minor.
  const majorAmount = amountMinor / 10 ** fromDecimals;
  const convertedMajor = majorAmount * rate;
  return roundHalfUp(convertedMajor * 10 ** toDecimals);
}

/**
 * Sum a list of money amounts (each in its own currency) into a single total
 * in the home currency.
 *
 * `rateLookup(fromCurrency)` should return the rate (1 fromCurrency = X homeCurrency)
 * or `undefined` if the rate is unknown. When `fromCurrency === homeCurrency`
 * the function expects the lookup to return 1 (or the caller can rely on the
 * same-currency shortcut inside convertMinor).
 *
 * Currencies with unknown rates are EXCLUDED from the total and collected in
 * `missingRates` (deduplicated).
 */
export function sumMinorToHome(
  items: { amountMinor: number; currency: string }[],
  homeCurrency: string,
  rateLookup: (fromCurrency: string) => number | undefined,
): { totalMinor: number; missingRates: string[] } {
  let totalMinor = 0;
  const missingSet = new Set<string>();

  for (const item of items) {
    const from = item.currency.toUpperCase();
    const home = homeCurrency.toUpperCase();

    if (from === home) {
      totalMinor += item.amountMinor;
      continue;
    }

    const rate = rateLookup(from);
    if (rate === undefined) {
      missingSet.add(from);
      continue;
    }

    totalMinor += convertMinor(item.amountMinor, from, home, rate);
  }

  return { totalMinor, missingRates: Array.from(missingSet) };
}

/**
 * Compact currency (e.g. "¥184k", "A$1.2k") for tight strips like BudgetGlance.
 * Lower-cases the magnitude suffix to match the design mocks. Falls back to
 * formatMoney for unknown currency codes.
 */
export function formatMoneyCompact(
  amountMinor: number,
  currency: string,
  locale: string = "en-AU",
): string {
  try {
    const decimals = decimalsFor(currency);
    const value = amountMinor / 10 ** decimals;
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      notation: "compact",
      maximumFractionDigits: 1,
      currencyDisplay: "narrowSymbol",
    })
      .format(value)
      .replace(/[KMBT]\b/g, (m) => m.toLowerCase());
  } catch {
    return formatMoney(amountMinor, currency, locale);
  }
}

/**
 * Return a currency's symbol via Intl (e.g. "JPY" -> "¥", "GBP" -> "£").
 * Uses `narrowSymbol` so foreign currencies render the bare glyph ("¥") rather
 * than a locale-prefixed form ("JP¥" under en-AU). Falls back to the uppercased
 * code for currencies the runtime doesn't know.
 */
export function currencySymbol(currency: string, locale: string = "en-AU"): string {
  const code = currency.toUpperCase();
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}
