/**
 * FX rate helpers for the Trip Planner.
 *
 * - fetchRate: live rate from Frankfurter API (network-isolated via injected fetcher).
 * - mergeRate: pure merge policy — manual rates are never overwritten.
 * - getRateForTrip: orchestration with injectable db + fetcher for testability.
 */

import type { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RateSource = "manual" | "fetched" | "stale" | "none" | "same";

export interface MergeRateResult {
  rate: number | null;
  source: RateSource;
  stale: boolean;
}

/** A fetched rate is considered stale for display once older than this. */
export const FX_STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours

/** True when a non-manual rate fetched at `fetchedAtMs` is stale relative to `nowMs`. */
export function isRateStale(fetchedAtMs: number, nowMs: number): boolean {
  return nowMs - fetchedAtMs > FX_STALE_AFTER_MS;
}

/** Minimal shape of an ExchangeRate row we work with. */
interface StoredRate {
  rate: number;
  manual: boolean;
  fetchedAt: Date;
}

// ---------------------------------------------------------------------------
// fetchRate — network-isolated, called via injected fetcher in tests
// ---------------------------------------------------------------------------

/**
 * Fetch the latest exchange rate between two currencies from Frankfurter.
 *
 * Returns `number | null` — null on any error (network failure, bad currency,
 * timeout, etc.). The caller decides what to do with the absence.
 *
 * If `from === to` returns 1 without hitting the network.
 */
export async function fetchRate(from: string, to: string): Promise<number | null> {
  if (from.toUpperCase() === to.toUpperCase()) return 1;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const url = `https://api.frankfurter.app/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rate = json.rates?.[to.toUpperCase()];
    return typeof rate === "number" ? rate : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// mergeRate — pure policy, no I/O
// ---------------------------------------------------------------------------

/**
 * Merge policy for combining a stored rate with a freshly fetched one.
 *
 * Rules (in priority order):
 * 1. If stored exists and manual=true → stored wins, always.
 * 2. If fetched is present → use fetched (source='fetched').
 * 3. If stored exists (non-manual) and fetched is null → stale fallback.
 * 4. Nothing at all → null / source='none'.
 */
export function mergeRate({
  stored,
  fetched,
}: {
  stored: StoredRate | null;
  fetched: number | null;
}): MergeRateResult {
  // Rule 1: manual lock — stored wins unconditionally.
  if (stored?.manual) {
    return { rate: stored.rate, source: "manual", stale: false };
  }

  // Rule 2: fresh fetch available — use it.
  if (fetched !== null) {
    return { rate: fetched, source: "fetched", stale: false };
  }

  // Rule 3: stale non-manual stored value.
  if (stored !== null) {
    return { rate: stored.rate, source: "stale", stale: true };
  }

  // Rule 4: nothing.
  return { rate: null, source: "none", stale: false };
}

// ---------------------------------------------------------------------------
// getRateForTrip — orchestration
// ---------------------------------------------------------------------------

type DbLike = Pick<PrismaClient, "exchangeRate">;

interface GetRateOptions {
  /** Prisma db client (or mock). */
  db: DbLike;
  /** Rate fetcher — defaults to fetchRate but overridable for tests. */
  fetcher?: (from: string, to: string) => Promise<number | null>;
}

/** A freshly fetched rate that should be written to the ExchangeRate cache. */
export interface RatePersist {
  /** Upper-cased base currency. */
  base: string;
  /** Upper-cased quote currency. */
  quote: string;
  rate: number;
}

export interface ResolvedRate {
  /** Rate to use: manual, fresh, stale fallback, or null if unavailable. */
  rate: number | null;
  /** Non-null only when a freshly fetched rate should be cached. */
  persist: RatePersist | null;
}

/**
 * Resolve a trip's base→quote rate WITHOUT writing anything.
 *
 * Reads the stored rate and (for non-manual pairs) performs the network fetch,
 * then returns the rate to use plus — when a fresh rate was fetched — a `persist`
 * descriptor for the caller to write. Keeping the write out of here lets callers
 * persist inside their own transaction (e.g. atomically with a Cost) and keeps the
 * network call out of any DB transaction. See ADR 0007.
 */
export async function resolveRateForTrip(
  tripId: string,
  base: string,
  quote: string,
  { db, fetcher = fetchRate }: GetRateOptions,
): Promise<ResolvedRate> {
  const B = base.toUpperCase();
  const Q = quote.toUpperCase();

  if (B === Q) return { rate: 1, persist: null };

  const stored = await (db.exchangeRate.findUnique as (args: object) => Promise<StoredRate | null>)({
    where: { tripId_base_quote: { tripId, base: B, quote: Q } },
  });

  // Manual rate — trust it, skip the network and any write.
  if (stored?.manual) {
    return { rate: stored.rate, persist: null };
  }

  const fetched = await fetcher(B, Q);

  if (fetched !== null) {
    return { rate: fetched, persist: { base: B, quote: Q, rate: fetched } };
  }

  // Fetch failed — fall back to the stale stored rate if any.
  return { rate: stored?.rate ?? null, persist: null };
}

/**
 * Write a freshly fetched rate to the ExchangeRate cache. Accepts any client with
 * an `exchangeRate` delegate (the global `db` or an interactive transaction `tx`)
 * so the write can join a caller's transaction. Never flips `manual` — a manual
 * lock would have been caught in resolveRateForTrip, so this only touches auto rates.
 * `fetchedAt` is stamped at write time; callers and `RatePersist` do not supply it.
 */
export async function persistRate(
  client: DbLike,
  tripId: string,
  persist: RatePersist,
): Promise<void> {
  await (client.exchangeRate.upsert as (args: object) => Promise<unknown>)({
    where: { tripId_base_quote: { tripId, base: persist.base, quote: persist.quote } },
    create: {
      tripId,
      base: persist.base,
      quote: persist.quote,
      rate: persist.rate,
      fetchedAt: new Date(),
      manual: false,
    },
    update: {
      rate: persist.rate,
      fetchedAt: new Date(),
    },
  });
}

/**
 * Get the current exchange rate for a trip (base → quote).
 *
 * 1. If base === quote, return 1 immediately.
 * 2. Look up stored ExchangeRate for (tripId, base, quote).
 * 3. If stored.manual, return it as-is (no network call).
 * 4. Otherwise fetch a fresh rate.
 *    - On success: upsert the stored rate (manual stays false) and return fetched.
 *    - On failure: return stale stored rate if any, else null.
 *
 * The db and fetcher are injectable so tests never touch the network or db.
 */
export async function getRateForTrip(
  tripId: string,
  base: string,
  quote: string,
  { db, fetcher = fetchRate }: GetRateOptions,
): Promise<number | null> {
  const { rate, persist } = await resolveRateForTrip(tripId, base, quote, { db, fetcher });
  if (persist) {
    await persistRate(db, tripId, persist);
  }
  return rate;
}
