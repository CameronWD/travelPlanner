import { NextRequest, NextResponse } from "next/server";
import { requireTripAccess } from "@/lib/guards";
import { persistRate, resolveRateForTrip } from "@/lib/fx";
import { db } from "@/lib/db";

/**
 * GET /api/fx?tripId=<id>&base=<ISO>&quote=<ISO>
 *
 * Returns the current exchange rate for the given currency pair within a trip.
 * Manual rates are returned as-is; auto rates are refreshed from Frankfurter.
 * If the network is unavailable, returns the last cached (stale) value.
 *
 * Response: { rate: number | null, source: 'manual'|'fetched'|'stale'|'none', stale: boolean }
 *
 * Errors: 400 missing params, 404 when requireTripAccess throws notFound().
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tripId = searchParams.get("tripId");
  const base = searchParams.get("base");
  const quote = searchParams.get("quote");

  if (!tripId || !base || !quote) {
    return NextResponse.json(
      { error: "tripId, base, and quote are required" },
      { status: 400 },
    );
  }

  // Access guard — notFound() throws internally (returns 404 via Next.js).
  await requireTripAccess(tripId);

  const B = base.toUpperCase();
  const Q = quote.toUpperCase();

  // Same-currency: trivial
  if (B === Q) {
    return NextResponse.json({ rate: 1, source: "same", stale: false });
  }

  // One read (spec 2026-10-06 §C): resolveRateForTrip says what the rate is,
  // so the old re-read of the stored row to work out `source` is gone.
  const resolved = await resolveRateForTrip(tripId, B, Q, { db });
  if (resolved.persist) await persistRate(db, tripId, resolved.persist);

  return NextResponse.json({ rate: resolved.rate, source: resolved.source, stale: resolved.stale });
}
