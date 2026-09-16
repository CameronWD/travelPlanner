"use client";

import { Analytics } from "@vercel/analytics/next";
import type { BeforeSendEvent } from "@vercel/analytics";

/**
 * Vercel Web Analytics, with share tokens stripped before anything leaves the
 * browser.
 *
 * WHY THE REDACTION IS NOT OPTIONAL
 * Vercel stores the *resolved* URL alongside the Next.js route pattern — its
 * own data-point table lists `URL: /blog/nextjs-10` and
 * `Dynamic Path: /blog/[slug]` as separate fields. `/share/[token]` is an
 * unauthenticated page whose token IS the read credential for a private
 * itinerary (app/share/[token]/page.tsx). Sending the resolved URL would put
 * live share tokens in a third-party analytics store, which is the "token in
 * a log" problem Vercel's own privacy docs warn about.
 *
 * Nothing is lost by redacting: the aggregate signal we actually want ("which
 * page types get opened on mobile in the field") lives in the Dynamic Path
 * dimension, which is unaffected.
 *
 * Trip IDs in /trips/[tripId]/... are deliberately NOT redacted. They sit
 * behind requireTripAccess and are useless without a session, and keeping them
 * allows a per-trip breakdown. Add them here if that trade stops being worth it.
 *
 * `beforeSend` is a function prop, so this must be a client component —
 * app/layout.tsx is a Server Component and cannot pass a function across the
 * boundary.
 */

/**
 * Replace the token in any /share/<token> path with a placeholder.
 *
 * Works on both a bare path and a full href, and leaves any query string or
 * hash intact. A bare "/share/" with no token is left alone (nothing to redact).
 */
export function redactShareToken(url: string): string {
  return url.replace(/\/share\/[^/?#]+/g, "/share/[token]");
}

/** The `beforeSend` middleware handed to Vercel's client. */
export function analyticsBeforeSend(
  event: BeforeSendEvent,
): BeforeSendEvent | null {
  const url = redactShareToken(event.url);
  return url === event.url ? event : { ...event, url };
}

export function VercelAnalytics() {
  return <Analytics beforeSend={analyticsBeforeSend} />;
}
