/**
 * The Other-cost form's starting values (spec 2026-10-06 §K). While
 * Travelling a spend is logged as it happens: today's Stop's currency
 * (Home currency when there's no Stop today or no known currency), Settlement
 * "On the trip", and paid today in full. Every other Phase keeps the plain
 * defaults. PURE — no React, no Prisma; every value stays editable in the form.
 */
import type { TripPhase } from "@/lib/trip-phase";
import type { CostSettlement } from "@/lib/enum-values";
import { currencyForCountry } from "@/lib/currency-for-country";

export interface OtherCostDefaults {
  currency: string;
  settlement: CostSettlement;
  /** Open with Paid ticked, dated today, and the paid amount following the cost. */
  paidToday: boolean;
}

export interface OtherCostDefaultsStop {
  arriveDate: string | null;
  departDate: string | null;
  /** ISO 3166-1 alpha-2, lower-case, as Stop.countryCode stores it. */
  countryCode: string | null;
}

export function otherCostDefaults({
  phase,
  homeCurrency,
  today,
  stops,
}: {
  phase: TripPhase;
  homeCurrency: string;
  today: string;
  stops: readonly OtherCostDefaultsStop[];
}): OtherCostDefaults {
  if (phase !== "travelling") return { currency: homeCurrency, settlement: "BEFORE", paidToday: false };
  // On a Changeover day two Stops claim today; the one you arrive at is where you're spending.
  const here = stops
    .filter((s) => s.arriveDate !== null && s.departDate !== null && s.arriveDate <= today && today <= s.departDate)
    .sort((a, b) => (a.arriveDate! < b.arriveDate! ? -1 : a.arriveDate! > b.arriveDate! ? 1 : 0))
    .at(-1);
  const currency = (here?.countryCode ? currencyForCountry(here.countryCode) : undefined) ?? homeCurrency;
  return { currency, settlement: "ON_TRIP", paidToday: true };
}
