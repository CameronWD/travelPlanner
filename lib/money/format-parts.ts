import { decimalsFor, formatMoney } from "@/lib/money";

/** Stored with two decimals (ISO 4217) but never shown with cents. */
const NO_CENTS_DISPLAY = new Set(["IDR"]);

/**
 * The Cost tile's total as two spans (MONEY.md §3): "$14,820" and ".40".
 * `fraction` carries its separator and is null when the currency shows no
 * minor units.
 */
export function formatMoneyParts(
  amountMinor: number,
  currency: string,
  locale: string = "en-AU",
): { whole: string; fraction: string | null } {
  const code = currency.toUpperCase();
  const decimals = decimalsFor(code);
  const shown = NO_CENTS_DISPLAY.has(code) ? 0 : decimals;
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: shown,
      maximumFractionDigits: shown,
    }).formatToParts(amountMinor / 10 ** decimals);
    const i = parts.findIndex((p) => p.type === "decimal");
    const join = (ps: Intl.NumberFormatPart[]) => ps.map((p) => p.value).join("");
    if (i === -1) return { whole: join(parts), fraction: null };
    return { whole: join(parts.slice(0, i)), fraction: join(parts.slice(i)) };
  } catch {
    return { whole: formatMoney(amountMinor, currency, locale), fraction: null };
  }
}

/** Whole units with the narrow symbol ("$9,340", "€760") for rows and sub-lines. */
export function formatMoneyWhole(amountMinor: number, currency: string, locale: string = "en-AU"): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amountMinor / 10 ** decimalsFor(code));
  } catch {
    return formatMoney(amountMinor, currency, locale);
  }
}
