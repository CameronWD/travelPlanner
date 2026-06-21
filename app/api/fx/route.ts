import { NextRequest, NextResponse } from "next/server";
import { requireTripAccess } from "@/lib/guards";
import { getRateForTrip } from "@/lib/fx";
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

  // Fetch via the full orchestration (reads db, may call Frankfurter).
  const rate = await getRateForTrip(tripId, B, Q, { db });

  // Determine source/stale by re-reading the stored record.
  // We check the stored row to give a meaningful source in the response.
  const stored = await db.exchangeRate.findUnique({
    where: { tripId_base_quote: { tripId, base: B, quote: Q } },
    select: { manual: true, fetchedAt: true, rate: true },
  });

  let source: string;
  let stale: boolean;

  if (rate === null) {
    source = "none";
    stale = false;
  } else if (stored?.manual) {
    source = "manual";
    stale = false;
  } else if (stored !== null && stored.rate === rate) {
    // Rate matched the stored value — it was either freshly upserted (fetched)
    // or returned as stale. A freshly upserted record has fetchedAt very recent.
    const ageMs = Date.now() - stored.fetchedAt.getTime();
    stale = ageMs > 5 * 60 * 1000; // older than 5 minutes = stale
    source = stale ? "stale" : "fetched";
  } else {
    source = "fetched";
    stale = false;
  }

  return NextResponse.json({ rate, source, stale });
}
