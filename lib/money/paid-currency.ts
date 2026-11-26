import { convertMinor } from "@/lib/money/money";

export interface PaidCurrencyFields {
  currency: string;
  paidCurrency?: string | null;
}

export const PAID_CURRENCY_MESSAGE = "What you paid can only be in the cost’s currency or your trip’s home currency.";

export function paidCurrencyOf(c: PaidCurrencyFields): string {
  return (c.paidCurrency || c.currency).toUpperCase();
}

export function paysInOwnCurrency(c: PaidCurrencyFields): boolean {
  return paidCurrencyOf(c) === c.currency.toUpperCase();
}

export function storedPaidCurrency(paid: string | null | undefined, currency: string): string | null {
  if (!paid || paid.toUpperCase() === currency.toUpperCase()) return null;
  return paid.toUpperCase();
}

export function paidCurrencyChoices(c: PaidCurrencyFields, homeCurrency: string | null): string[] {
  const choices = [c.currency, homeCurrency, c.paidCurrency]
    .filter((code): code is string => Boolean(code))
    .map((code) => code.toUpperCase());
  return [...new Set(choices)];
}

export function followCurrencyChange(
  paid: string,
  from: string,
  to: string,
  homeCurrency: string | null,
  hasPaidAmount: boolean,
): string {
  const p = paid.toUpperCase();
  const keep = hasPaidAmount && (p === homeCurrency?.toUpperCase() || p !== from.toUpperCase());
  return keep ? p : to.toUpperCase();
}

export function paidCurrencyProblem(
  next: string | null,
  c: { currency: string; storedPaidCurrency: string | null },
  homeCurrency: string,
): string | null {
  if (next == null) return null;
  const n = next.toUpperCase();
  const allowed = [c.currency, homeCurrency, c.storedPaidCurrency].some((code) => code?.toUpperCase() === n);
  return allowed ? null : PAID_CURRENCY_MESSAGE;
}

export function toHome(minor: number, from: string, homeCurrency: string, rate: number | null | undefined): number | null {
  if (from.toUpperCase() === homeCurrency.toUpperCase()) return minor;
  return typeof rate === "number" ? convertMinor(minor, from, homeCurrency, rate) : null;
}
