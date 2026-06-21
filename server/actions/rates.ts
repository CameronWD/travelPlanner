"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { getRateForTrip } from "@/lib/fx";

// ---------------------------------------------------------------------------
// setManualRate
// ---------------------------------------------------------------------------

/**
 * Upsert a manually-entered exchange rate for a trip.
 * Manual rates are never overwritten by auto-fetch.
 */
export async function setManualRate(
  tripId: string,
  base: string,
  quote: string,
  rate: number,
): Promise<{ success: true }> {
  await requireTripAccess(tripId);

  const B = base.toUpperCase();
  const Q = quote.toUpperCase();
  const now = new Date();

  await db.exchangeRate.upsert({
    where: { tripId_base_quote: { tripId, base: B, quote: Q } },
    create: { tripId, base: B, quote: Q, rate, fetchedAt: now, manual: true },
    update: { rate, fetchedAt: now, manual: true },
  });

  revalidatePath(`/trips/${tripId}/budget`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// clearManualRate
// ---------------------------------------------------------------------------

/**
 * Clear the manual lock on a stored rate so the next request will auto-fetch
 * a fresh value from Frankfurter.
 *
 * Sets `manual = false` rather than deleting the row so the stale value
 * remains available as a fallback if the network is unreachable.
 */
export async function clearManualRate(
  tripId: string,
  base: string,
  quote: string,
): Promise<{ success: true }> {
  await requireTripAccess(tripId);

  const B = base.toUpperCase();
  const Q = quote.toUpperCase();

  await db.exchangeRate.update({
    where: { tripId_base_quote: { tripId, base: B, quote: Q } },
    data: { manual: false },
  });

  revalidatePath(`/trips/${tripId}/budget`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// refreshRates
// ---------------------------------------------------------------------------

interface RefreshResult {
  base: string;
  rate: number | null;
}

/**
 * Refresh exchange rates for a list of base currencies to the trip's home
 * currency (quote).  Manual rates are honoured (getRateForTrip skips the
 * network for them), so they won't be overwritten.
 *
 * Returns a summary of rates fetched / failed per currency.
 */
export async function refreshRates(
  tripId: string,
  baseCurrencies: string[],
  quote: string,
): Promise<{ results: RefreshResult[] }> {
  await requireTripAccess(tripId);

  const Q = quote.toUpperCase();
  const results: RefreshResult[] = [];

  for (const base of baseCurrencies) {
    const B = base.toUpperCase();

    // Same currency — no rate needed, skip.
    if (B === Q) continue;

    const rate = await getRateForTrip(tripId, B, Q, { db });
    results.push({ base: B, rate });
  }

  revalidatePath(`/trips/${tripId}/budget`);
  return { results };
}
