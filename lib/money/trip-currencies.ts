import { CURRENCY_CODES } from "@/lib/money/currencies";
import { currencyForCountry } from "@/lib/money/currency-for-country";

export const MORE_CURRENCIES = "More currencies";

export function tripCurrencies(input: {
  homeCurrency: string;
  stopCountryCodes: readonly (string | null)[];
  costCurrencies: readonly string[];
}): string[] {
  const out = new Set<string>([input.homeCurrency.toUpperCase()]);
  for (const code of input.stopCountryCodes) {
    const currency = code ? currencyForCountry(code) : undefined;
    if (currency) out.add(currency.toUpperCase());
  }
  for (const currency of input.costCurrencies) out.add(currency.toUpperCase());
  return [...out];
}

export function currencyChoices(trip: readonly string[], current: string, expanded: boolean): string[] {
  const out = new Set<string>(trip);
  if (expanded) for (const code of CURRENCY_CODES) out.add(code);
  out.add(current);
  return [...out];
}
