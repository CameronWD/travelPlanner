import { relativeTime } from "@/lib/relative-time";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "In AUD · 35 nights · 14 costs in 3 currencies" (MONEY.md §2); zero parts drop out. */
export function moneyMetaLine({
  homeCurrency,
  nights,
  costCount,
  currencyCount,
}: {
  homeCurrency: string;
  nights: number;
  costCount: number;
  currencyCount: number;
}): string {
  const parts = [`In ${homeCurrency.toUpperCase()}`];
  if (nights > 0) parts.push(plural(nights, "night", "nights"));
  if (costCount > 0) {
    const costs = plural(costCount, "cost", "costs");
    parts.push(currencyCount > 1 ? `${costs} in ${currencyCount} currencies` : costs);
  }
  return parts.join(" · ");
}

export function perNightMinor(totalMinor: number, nights: number): number | null {
  return nights > 0 ? Math.round(totalMinor / nights) : null;
}

/** Split with N (spec §B1): every TripMember, owner included; null below two. */
export function perPersonMinor(totalMinor: number, members: number): number | null {
  return members >= 2 ? Math.round(totalMinor / members) : null;
}

export function paidPct(paidMinor: number, totalMinor: number): number {
  if (totalMinor <= 0) return 0;
  if (paidMinor >= totalMinor) return 100;
  return Math.min(99, Math.round((paidMinor / totalMinor) * 100));
}

/** "2 IDR costs left out of totals until you set a rate." (MONEY.md §6). */
export function missingRatesLine(costs: { currency: string }[], missing: string[]): string | null {
  if (missing.length === 0) return null;
  const counts = missing.map((code) => ({
    code: code.toUpperCase(),
    n: costs.filter((c) => c.currency.toUpperCase() === code.toUpperCase()).length,
  }));
  const total = counts.reduce((s, c) => s + c.n, 0);
  const labels = counts.map((c) => `${c.n} ${c.code}`);
  const joined =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `${joined} ${total === 1 ? "cost" : "costs"} left out of totals until you set a rate.`;
}

/** Rates strip header note: "1 set by you", else "Updated 2h ago" from the newest fetch. */
export function ratesUpdatedNote(rates: { manual: boolean; fetchedAt: Date }[], now: Date = new Date()): string | null {
  if (rates.length === 0) return null;
  const manual = rates.filter((r) => r.manual).length;
  if (manual > 0) return `${manual} set by you`;
  const newest = rates.reduce((a, b) => (b.fetchedAt > a.fetchedAt ? b : a));
  return `Updated ${relativeTime(newest.fetchedAt, now)}`;
}
